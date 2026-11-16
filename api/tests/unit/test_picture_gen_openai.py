"""picture-gen's OpenAI provider (owner decision 2026-11-16; ADR-0031 "Provider: OpenAI") on moto S3. OpenAI is never
called: a fake client stands in for most tests, and the last tests drive the real `openai` SDK through
httpx2.MockTransport with a canned Responses event stream (skipped where the SDK is not installed; CI installs it from
api/requirements-dev.txt).

What is pinned here: the request (the same system text as Bedrock's three blocks, joined in order, as `instructions`;
the same user message as `input`; max_output_tokens with reasoning headroom; effort medium; store false; a stable
prompt_cache_key per kind), every outcome's error.json code, the usage mapping, the provider switch, and the API key:
read from Secrets Manager once per container, never logged, never written to S3.
"""

from __future__ import annotations

import json
import re
import signal
import time
from collections.abc import Iterator
from dataclasses import dataclass, field, replace
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import boto3
import pytest
from botocore.exceptions import ClientError
from conftest import CapturedLogger, load_handler

from shared.pictures import KIND_IDS
from shared.svg_sanitise import sanitise

gen = load_handler("picture_gen")
REPO_ROOT = Path(__file__).resolve().parents[3]

BUCKET = "test-pictures-bucket"
JOB = "00000000-0000-4000-8000-000000000001"
JOB_2 = "00000000-0000-4000-8000-000000000003"
SECRET_ARN = "arn:aws:secretsmanager:eu-west-2:123456789012:secret:space-tower-defence-prod-openai-api-key-AbCdEf"  # noqa: S105 - an ARN, not a secret
KEY = "sk-proj-TEST-ONLY-not-a-real-key-0123456789"
CONFIG = gen.WorkerConfig(
    bucket=BUCKET,
    job_prefix="jobs/",
    model_id="eu.anthropic.claude-opus-5-5",
    max_tokens=16000,
    region="eu-west-2",
    provider="openai",
    openai_model_id="gpt-6.1-sol",
    openai_base_url="https://eu.api.openai.com/v1",
    openai_secret_arn=SECRET_ARN,
)
DRAWING = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">'
    '<g stroke="#2A1E3D" stroke-width="7"><circle cx="128" cy="128" r="60" fill="#FFD23F"/></g></svg>'
)


# --- A fake OpenAI client --------------------------------------------------------------------------------------------


def usage(output: int = 5000, cached: int = 1500, written: int | None = 400) -> SimpleNamespace:
    details = SimpleNamespace(cached_tokens=cached)
    if written is not None:
        details.cache_write_tokens = written
    return SimpleNamespace(
        input_tokens=2000,
        input_tokens_details=details,
        output_tokens=output,
        output_tokens_details=SimpleNamespace(reasoning_tokens=3000),
        total_tokens=2000 + output,
    )


def message_item(*parts: SimpleNamespace) -> SimpleNamespace:
    return SimpleNamespace(type="message", content=list(parts))


def text_part(text: str) -> SimpleNamespace:
    return SimpleNamespace(type="output_text", text=text)


def refusal_part(text: str = "I can't help with that.") -> SimpleNamespace:
    return SimpleNamespace(type="refusal", refusal=text)


def response(
    status: str = "completed",
    text: str | None = DRAWING,
    *,
    output: list[Any] | None = None,
    reason: str | None = None,
    error_code: str | None = None,
    use: Any = None,
) -> SimpleNamespace:
    items = output if output is not None else ([message_item(text_part(text))] if text is not None else [])
    joined = "".join(
        p.text for item in items if item.type == "message" for p in item.content if p.type == "output_text"
    )
    return SimpleNamespace(
        status=status,
        output=items,
        output_text=joined,
        incomplete_details=SimpleNamespace(reason=reason) if reason is not None else None,
        error=SimpleNamespace(code=error_code, message="secret upstream text") if error_code is not None else None,
        usage=use if use is not None else usage(),
    )


def ev(kind: str, **fields: Any) -> SimpleNamespace:
    return SimpleNamespace(type=kind, **fields)


def events_for(final: Any, terminal: str = "response.completed", deltas: int = 3) -> list[Any]:
    started = SimpleNamespace(status="in_progress", output=[], usage=None)
    return [
        ev("response.created", response=started),
        ev("response.in_progress", response=started),
        ev("response.output_item.added", item=SimpleNamespace(type="reasoning")),
        ev("response.output_item.done", item=SimpleNamespace(type="reasoning")),
        ev("response.output_item.added", item=SimpleNamespace(type="message")),
        ev("response.content_part.added"),
        *[ev("response.output_text.delta", delta="x") for _ in range(deltas)],
        ev(terminal, response=final),
    ]


@dataclass
class FakeStream:
    events: list[Any]
    error: BaseException | None = None

    def __enter__(self) -> FakeStream:
        return self

    def __exit__(self, *args: Any) -> None:
        return None

    def __iter__(self) -> Iterator[Any]:
        yield from self.events
        if self.error is not None:
            raise self.error

    def get_final_response(self) -> Any:  # never used: the handler reads the terminal event
        raise AssertionError("get_final_response raises on incomplete and failed; the handler must not call it")


@dataclass
class FakeOpenAI:
    """Stands in for openai.OpenAI: records each responses.stream call."""

    final: Any = None
    terminal: str = "response.completed"
    events: list[Any] | None = None
    open_error: BaseException | None = None  # raised when the stream opens (an HTTP error status)
    stream_error: BaseException | None = None  # raised after the events (a broken stream)
    calls: list[dict[str, Any]] = field(default_factory=list)

    @property
    def responses(self) -> FakeOpenAI:
        return self

    def stream(self, **kwargs: Any) -> FakeStream:
        self.calls.append(kwargs)
        if self.open_error is not None:
            raise self.open_error
        final = self.final if self.final is not None else response()
        events = self.events if self.events is not None else events_for(final, self.terminal)
        return FakeStream(events, self.stream_error)


class StatusError(Exception):
    """Shaped like the SDK's APIStatusError: a status, OpenAI's error code, and a message that can echo the key."""

    def __init__(self, status: int, code: str | None = None) -> None:
        super().__init__(f"Incorrect API key provided: {KEY}. secret prompt text")
        self.status_code = status
        self.code = code


class APIConnectionError(Exception):
    pass


class APITimeoutError(APIConnectionError):  # the SDK's name: matched by class name, as the handler does
    pass


class Harness:
    def __init__(self, secret: str | None = KEY, config: Any = CONFIG) -> None:
        self.s3 = boto3.client("s3", region_name="eu-west-2")
        self.s3.create_bucket(Bucket=BUCKET, CreateBucketConfiguration={"LocationConstraint": "eu-west-2"})
        self.openai = FakeOpenAI()
        self.logger = CapturedLogger()
        self.ticks = 0.0
        self.secret_value = secret
        self.secret_error: BaseException | None = None
        self.secret_reads: list[str] = []
        self.clients: list[tuple[str, str]] = []  # (kind, key) each client was built with
        self.bedrock_calls = 0
        self.worker = gen.Worker(
            gen.Deps(
                config=lambda: config,
                s3=lambda: self.s3,
                bedrock=self.bedrock,
                openai=self.client,
                secret=self.secret,
                clock=self.clock,
                now=lambda: datetime(2026, 11, 20, 10, 0, tzinfo=UTC),
            ),
            self.logger,
        )

    def client(self, config: Any, kind: str, api_key: str) -> FakeOpenAI:
        self.clients.append((kind, api_key))
        return self.openai

    def bedrock(self, config: Any, kind: str) -> Any:
        self.bedrock_calls += 1
        raise AssertionError("the openai provider must never build a Bedrock client")

    def secret(self, arn: str) -> str | None:
        self.secret_reads.append(arn)
        if self.secret_error is not None:
            raise self.secret_error
        return self.secret_value

    def clock(self) -> float:
        self.ticks += 1.0
        return self.ticks

    def run(self, job: str = JOB, **body: Any) -> dict[str, Any]:
        doc = {"jobId": job, "description": "a friendly yellow sun", **body}
        return self.worker.handle({"Records": [{"body": json.dumps(doc)}]})

    def read(self, name: str, job: str = JOB) -> Any:
        try:
            raw = self.s3.get_object(Bucket=BUCKET, Key=f"jobs/{job}/{name}")["Body"].read()
        except self.s3.exceptions.NoSuchKey:
            return None
        return json.loads(raw) if name.endswith(".json") else raw

    def everything_written(self) -> str:
        """Every object in the bucket and every log line, as one string (to look for the key in)."""
        texts = [json.dumps(self.logger.lines())]
        for item in self.s3.list_objects_v2(Bucket=BUCKET).get("Contents", []):
            texts.append(self.s3.get_object(Bucket=BUCKET, Key=item["Key"])["Body"].read().decode("utf-8", "replace"))
        return "\n".join(texts)


@pytest.fixture
def h(aws_env: None) -> Any:
    from moto import mock_aws

    with mock_aws():
        yield Harness()


# --- The request ---------------------------------------------------------------------------------------------------


def test_the_request_has_the_designed_shape(h: Harness) -> None:
    h.run()
    [call] = h.openai.calls
    assert set(call) == {
        "model",
        "instructions",
        "input",
        "max_output_tokens",
        "reasoning",
        "store",
        "prompt_cache_key",
    }
    assert call["model"] == "gpt-6.1-sol"
    assert call["max_output_tokens"] == 24000  # the kind's 16,000 plus half again for reasoning
    assert call["reasoning"] == {"effort": "medium"}
    assert call["store"] is False
    assert call["prompt_cache_key"] == "picture-gen:activity-object:v1"
    assert not {"temperature", "top_p", "max_tokens", "system", "messages", "background"} & set(call)
    assert call["input"] == "<request>a friendly yellow sun</request>"
    assert h.clients == [("activity-object", KEY)]


@pytest.mark.parametrize("kind", KIND_IDS)
def test_the_instructions_are_bedrocks_three_blocks_in_order(kind: str) -> None:
    """The same system text for both providers: core RULES, then STYLE.md, then the kind block."""
    blocks = gen.system_blocks(kind)
    text = gen.instructions(kind)
    assert text == "\n\n".join(b["text"] for b in blocks)
    assert text.startswith(gen.RULES)
    assert text.index("<style-guide>") < text.index(f'<picture-kind id="{kind}">')
    gen.style_text.cache_clear()
    gen.kind_text.cache_clear()
    assert gen.instructions(kind) == text  # stable bytes, so the automatic prompt cache hits
    assert len(text) > 4 * 1024  # over OpenAI's 1,024-token cache minimum
    assert gen.prompt_cache_key(kind) == f"picture-gen:{kind}:v1"


def test_a_background_gets_its_own_tokens_client_and_cache_key(h: Harness) -> None:
    backdrop = (REPO_ROOT / "art" / "svg" / "map" / "luna-backdrop.svg").read_text(encoding="utf-8")
    h.openai.final = response(text=backdrop)
    h.run(kind="background")
    [call] = h.openai.calls
    assert call["max_output_tokens"] == 48000  # 32,000 plus half again
    assert call["prompt_cache_key"] == "picture-gen:background:v1"
    assert call["instructions"] == gen.instructions("background")
    assert h.clients == [("background", KEY)]
    assert h.read("result.json")["svg"].startswith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3840 2112"')


def test_max_output_tokens_per_kind() -> None:
    for kind in KIND_IDS:
        expected = 48000 if kind == "background" else 24000
        assert gen.max_output_tokens_for(CONFIG, kind) == expected, kind
        assert gen.max_output_tokens_for(CONFIG, kind) <= gen.OPENAI_MAX_OUTPUT_CEILING


def test_a_redraw_sends_the_previous_drawing_in_the_input(h: Harness) -> None:
    previous = "00000000-0000-4000-8000-000000000002"
    h.s3.put_object(Bucket=BUCKET, Key=f"jobs/{previous}/result.json", Body=json.dumps({"svg": sanitise(DRAWING).svg}))
    h.run(previousJobId=previous, change="make it bigger")
    text = h.openai.calls[0]["input"]
    assert text.startswith("<request>a friendly yellow sun</request>\n<previous-drawing>\n<svg ")
    assert text.endswith("</previous-drawing>\n<change>make it bigger</change>")
    assert h.openai.calls[0]["instructions"] == gen.instructions()  # the cached prefix is shared with a first drawing


# --- Outcomes ------------------------------------------------------------------------------------------------------


def test_a_good_drawing_is_stored_with_its_usage_and_logged_with_the_provider(h: Harness) -> None:
    assert h.run() == {"batchItemFailures": []}
    result = h.read("result.json")
    assert result["svg"] == sanitise(DRAWING).svg
    assert result["usage"] == {"input": 2000, "output": 5000, "cacheRead": 1500, "cacheWrite": 400}
    assert (result["stopReason"], result["model"]) == ("completed", "gpt-6.1-sol")
    assert h.read("error.json") is None
    line = h.logger.lines()[-1]
    assert line == {
        "level": "INFO",
        "metric": "picture_usage",
        "jobId": JOB,
        "provider": "openai",
        "model": "gpt-6.1-sol",
        "kind": "activity-object",
        "inputTokens": 2000,
        "outputTokens": 5000,  # includes the 3,000 reasoning tokens
        "cacheReadTokens": 1500,
        "cacheWriteTokens": 400,
        "stopReason": "completed",
        "result": "OK",
        "durationMs": line["durationMs"],
    }


def test_a_usage_without_cache_write_tokens_counts_zero(h: Harness) -> None:
    h.openai.final = response(use=usage(written=None))
    h.run()
    assert h.read("result.json")["usage"]["cacheWrite"] == 0


def test_progress_maps_reasoning_to_thinking_and_text_to_drawing(h: Harness, monkeypatch: Any) -> None:
    writes: list[tuple[str, int]] = []
    real = gen.Worker.progress

    def counting(self: Any, s3: Any, config: Any, job_id: str, phase: str, tokens: int) -> None:
        writes.append((phase, tokens))
        real(self, s3, config, job_id, phase, tokens)

    monkeypatch.setattr(gen.Worker, "progress", counting)
    h.run()
    assert writes == [("thinking", 0), ("drawing", 0)]
    assert h.read("progress.json") == {"phase": "drawing", "outputTokens": 0, "at": "2026-11-20T10:00:00Z"}


def test_progress_within_a_phase_carries_the_text_chunks_so_far(h: Harness, monkeypatch: Any) -> None:
    writes: list[tuple[str, int]] = []
    real = gen.Worker.progress

    def counting(self: Any, s3: Any, config: Any, job_id: str, phase: str, tokens: int) -> None:
        writes.append((phase, tokens))
        real(self, s3, config, job_id, phase, tokens)

    monkeypatch.setattr(gen.Worker, "progress", counting)
    h.openai.events = events_for(response(), deltas=25)
    h.run()
    # thinking at the first event, drawing when the message starts, then every 10 ticks (one tick per event)
    assert [w[0] for w in writes] == ["thinking", "drawing", "drawing", "drawing"]
    assert writes[-1][1] > writes[-2][1] > 0


@pytest.mark.parametrize(
    ("final", "terminal", "code", "stop"),
    [
        pytest.param(response(output=[message_item(refusal_part())]), "response.completed", "declined", "completed",
                     id="refusal-part"),
        pytest.param(response(output=[message_item(refusal_part(), text_part(DRAWING))]), "response.completed",
                     "declined", "completed", id="refusal-beside-text"),
        pytest.param(response(text="<svg-refused/>"), "response.completed", "declined", "completed", id="svg-refused"),
        pytest.param(response("incomplete", None, reason="content_filter"), "response.incomplete", "declined",
                     "content_filter", id="content-filter"),
        pytest.param(response("incomplete", DRAWING[:100], reason="max_output_tokens"), "response.incomplete",
                     "too_long", "max_output_tokens", id="max-output-tokens"),
        pytest.param(response("incomplete", None, reason="max_messages"), "response.incomplete", "unusable",
                     "max_messages", id="other-incomplete"),
        pytest.param(response(text="Here is a sun!"), "response.completed", "unusable", "completed", id="no-svg"),
        pytest.param(response(text=DRAWING.replace("</svg>", "<text>A</text></svg>")), "response.completed",
                     "unusable", "completed", id="sanitiser-refuses"),
        pytest.param(response(text=None), "response.completed", "unusable", "completed", id="no-output"),
    ],
)  # fmt: skip
def test_each_outcome_becomes_its_error_code_with_the_usage_logged(
    h: Harness, final: Any, terminal: str, code: str, stop: str
) -> None:
    h.openai.final = final
    h.openai.terminal = terminal
    assert h.run() == {"batchItemFailures": []}
    assert h.read("error.json") == {"code": code}
    assert h.read("result.json") is None
    line = h.logger.lines()[-1]
    assert (line["result"], line["code"], line["stopReason"], line["provider"]) == ("ERROR", code, stop, "openai")
    assert (line["inputTokens"], line["outputTokens"]) == (2000, 5000)  # billed, so logged


def test_a_failed_response_is_a_provider_error_with_its_code_and_usage(h: Harness) -> None:
    h.openai.final = response("failed", None, error_code="server_error", use=usage(output=700))
    h.openai.terminal = "response.failed"
    h.run()
    assert h.read("error.json") == {"code": "bedrock_error"}
    line = h.logger.lines()[-1]
    assert (line["errorType"], line["upstreamError"], line["outputTokens"]) == ("ResponseFailed", "server_error", 700)
    assert "secret upstream text" not in json.dumps(h.logger.lines())


def test_an_error_event_is_a_provider_error(h: Harness) -> None:
    started = SimpleNamespace(status="in_progress", output=[], usage=None)
    h.openai.events = [ev("response.created", response=started), ev("error", code="server_error", message="secret")]
    h.run()
    assert h.read("error.json") == {"code": "bedrock_error"}
    line = h.logger.lines()[-1]
    assert (line["errorType"], line["upstreamError"]) == ("ResponseFailed", "server_error")


def test_a_stream_that_ends_without_a_final_event_is_a_provider_error(h: Harness) -> None:
    h.openai.events = events_for(response())[:-1]
    h.run()
    assert h.read("error.json") == {"code": "bedrock_error"}
    assert h.logger.lines()[-1]["errorType"] == "ResponseFailed"


@pytest.mark.parametrize(
    ("error", "code"),
    [
        pytest.param(StatusError(429, "rate_limit_exceeded"), "throttled", id="429"),
        pytest.param(StatusError(429, "insufficient_quota"), "throttled", id="429-quota"),
        pytest.param(StatusError(500, "server_error"), "bedrock_error", id="500"),
        pytest.param(StatusError(400, "invalid_request_error"), "bedrock_error", id="400"),
        pytest.param(APITimeoutError("read timed out"), "timed_out", id="sdk-timeout"),
        pytest.param(APIConnectionError("reset"), "bedrock_error", id="connection"),
    ],
)
def test_an_sdk_error_is_an_error_object(h: Harness, error: Exception, code: str) -> None:
    h.openai.open_error = error
    assert h.run() == {"batchItemFailures": []}
    assert h.read("error.json") == {"code": code}
    line = h.logger.lines()[-1]
    assert line["errorType"] == type(error).__name__
    if isinstance(error, StatusError):
        assert (line["upstreamStatus"], line["upstreamError"]) == (error.status_code, error.code)


def test_a_timeout_mid_stream_is_timed_out(h: Harness) -> None:
    h.openai.events = events_for(response())[:5]
    h.openai.stream_error = APITimeoutError("read timed out")
    h.run()
    assert h.read("error.json") == {"code": "timed_out"}
    assert h.logger.lines()[-1]["errorType"] == "APITimeoutError"


@pytest.mark.parametrize("bad", ["Invalid Key", "x" * 65, "<b>", "", "rate-limit"])
def test_an_odd_openai_error_code_is_left_out(h: Harness, bad: str) -> None:
    h.openai.open_error = StatusError(500, bad)
    h.run()
    line = h.logger.lines()[-1]
    assert line["upstreamStatus"] == 500
    assert "upstreamError" not in line


# --- The key -------------------------------------------------------------------------------------------------------


@pytest.mark.parametrize("status", [401, 403])
def test_a_refused_key_is_not_set_up_and_is_read_again_next_time(h: Harness, status: int) -> None:
    h.openai.open_error = StatusError(status, "invalid_api_key")
    h.run()
    assert h.read("error.json") == {"code": "not_set_up"}
    line = h.logger.lines()[-1]
    assert (line["code"], line["upstreamStatus"], line["upstreamError"]) == ("not_set_up", status, "invalid_api_key")
    # The owner stores a new key: the next job reads the secret again and draws.
    h.openai.open_error = None
    h.secret_value = "sk-proj-TEST-ONLY-the-new-key"  # noqa: S105 - a test value
    h.run(job=JOB_2)
    assert h.read("result.json", JOB_2) is not None
    assert h.secret_reads == [SECRET_ARN, SECRET_ARN]
    assert h.clients[-1] == ("activity-object", "sk-proj-TEST-ONLY-the-new-key")


@pytest.mark.parametrize("value", [None, "", "  \n"])
def test_a_secret_without_a_value_is_not_set_up_without_a_call(h: Harness, value: str | None) -> None:
    h.secret_value = value
    h.run()
    assert h.read("error.json") == {"code": "not_set_up"}
    assert h.openai.calls == [] and h.clients == []
    assert h.read("claim") == b""
    line = h.logger.lines()[-1]
    assert (line["result"], line["code"], line["provider"]) == ("ERROR", "not_set_up", "openai")
    # Once the owner stores the key, the next job draws without a release.
    h.secret_value = KEY
    h.run(job=JOB_2)
    assert h.read("result.json", JOB_2) is not None


def test_the_secret_is_read_once_per_container(h: Harness) -> None:
    h.run()
    h.run(job=JOB_2)
    assert h.secret_reads == [SECRET_ARN]
    assert [key for _, key in h.clients] == [KEY, KEY]


def test_the_key_is_stripped_of_surrounding_white_space(h: Harness) -> None:
    h.secret_value = f"  {KEY}\n"
    h.run()
    assert h.clients == [("activity-object", KEY)]


def test_a_secret_that_cannot_be_read_is_a_provider_error_without_aws_text(h: Harness) -> None:
    h.secret_error = ClientError(
        {"Error": {"Code": "AccessDeniedException", "Message": "secret aws text"}}, "GetSecretValue"
    )
    h.run()
    assert h.read("error.json") == {"code": "bedrock_error"}
    assert h.logger.lines()[-1]["errorType"] == "SecretUnreadable"
    assert "secret aws text" not in json.dumps(h.logger.lines())
    assert h.openai.calls == []


def test_the_key_never_reaches_a_log_line_or_s3(h: Harness) -> None:
    h.run()  # success
    h.openai.open_error = StatusError(401, "invalid_api_key")  # its message echoes the key
    h.run(job=JOB_2)
    written = h.everything_written()
    assert KEY not in written and KEY[-12:] not in written
    assert "secret prompt text" not in written


def test_read_secret_asks_secrets_manager_for_the_one_arn(aws_env: None, monkeypatch: Any) -> None:
    from moto import mock_aws

    with mock_aws():
        gen.secrets_client.cache_clear()
        client = boto3.client("secretsmanager", region_name="eu-west-2")
        arn = client.create_secret(Name="space-tower-defence-prod-openai-api-key")["ARN"]
        assert gen.read_secret(arn) is None  # created by Terraform with no value yet
        client.put_secret_value(SecretId=arn, SecretString=KEY)
        assert gen.read_secret(arn) == KEY
        gen.secrets_client.cache_clear()


# --- The deadline --------------------------------------------------------------------------------------------------


def test_a_stream_past_the_jobs_deadline_is_closed_and_timed_out(h: Harness) -> None:
    readings = iter([0.0, 1.0, 2.0])  # the job's start, the draw's start, the alarm's arming; then 800 s later

    def clock() -> float:
        return next(readings, 800.0)

    h.worker.deps = replace(h.worker.deps, clock=clock)
    h.run(kind="background")
    assert h.read("result.json") is None
    assert h.read("error.json") == {"code": "timed_out"}
    line = h.logger.lines()[-1]
    assert (line["result"], line["code"], line["errorType"]) == ("ERROR", "timed_out", "DeadlinePassed")


def test_a_read_that_blocks_past_the_deadline_is_broken_by_the_alarm(h: Harness) -> None:
    readings = iter([0.0, 1.0, gen.CALL_SECONDS - 0.2])  # the alarm is armed 0.2 s before the deadline

    def clock() -> float:
        return next(readings, gen.CALL_SECONDS - 0.1)

    class BlockedStream(FakeStream):
        def __iter__(self) -> Iterator[Any]:
            time.sleep(5)  # a read that never returns in time
            yield from self.events

    def stream(**kwargs: Any) -> FakeStream:
        h.openai.calls.append(kwargs)
        return BlockedStream([])

    h.worker.deps = replace(h.worker.deps, clock=clock)
    h.openai.stream = stream  # type: ignore[method-assign]
    before = signal.getsignal(signal.SIGALRM)
    began = time.monotonic()
    h.run(kind="background")
    assert time.monotonic() - began < 2
    assert h.read("error.json") == {"code": "timed_out"}
    assert signal.getsignal(signal.SIGALRM) == before


# --- The switch ----------------------------------------------------------------------------------------------------


def openai_env(monkeypatch: Any, provider: str | None) -> None:
    monkeypatch.setenv("PICTURES_BUCKET", "b")
    monkeypatch.setenv("BEDROCK_MODEL_ID", "eu.anthropic.claude-opus-5-5")
    monkeypatch.setenv("BEDROCK_MAX_TOKENS", "16000")
    monkeypatch.setenv("AWS_REGION", "eu-west-2")
    monkeypatch.setenv("OPENAI_MODEL_ID", "gpt-6.1-sol")
    monkeypatch.setenv("OPENAI_BASE_URL", "https://eu.api.openai.com/v1")
    monkeypatch.setenv("OPENAI_SECRET_ARN", SECRET_ARN)
    monkeypatch.delenv("PICTURE_JOB_PREFIX", raising=False)
    if provider is None:
        monkeypatch.delenv("PICTURE_PROVIDER", raising=False)
    else:
        monkeypatch.setenv("PICTURE_PROVIDER", provider)


def test_the_config_reads_the_openai_environment(monkeypatch: Any) -> None:
    openai_env(monkeypatch, "openai")
    config = gen.WorkerConfig.from_env()
    assert config == replace(CONFIG, bucket="b")
    assert config.model == "gpt-6.1-sol"


def test_bedrock_is_the_provider_when_none_is_named_and_draws_with_its_model(monkeypatch: Any) -> None:
    openai_env(monkeypatch, None)
    config = gen.WorkerConfig.from_env()
    assert (config.provider, config.model) == ("bedrock", "eu.anthropic.claude-opus-5-5")
    openai_env(monkeypatch, "bedrock")
    monkeypatch.delenv("OPENAI_SECRET_ARN")  # not needed for Bedrock
    assert gen.WorkerConfig.from_env().provider == "bedrock"


def test_an_unknown_provider_or_a_missing_openai_setting_fails_the_config(monkeypatch: Any) -> None:
    openai_env(monkeypatch, "gemini")
    with pytest.raises(ValueError, match="PICTURE_PROVIDER"):
        gen.WorkerConfig.from_env()
    openai_env(monkeypatch, "openai")
    monkeypatch.delenv("OPENAI_SECRET_ARN")
    with pytest.raises(KeyError):
        gen.WorkerConfig.from_env()


def test_the_bedrock_provider_never_reads_the_secret_or_builds_an_openai_client(aws_env: None) -> None:
    from moto import mock_aws

    with mock_aws():
        h = Harness(config=replace(CONFIG, provider="bedrock"))
        bedrock_calls: list[str] = []

        class Bedrock:
            @property
            def messages(self) -> Any:
                return self

            def stream(self, **kwargs: Any) -> Any:
                bedrock_calls.append(kwargs["model"])
                raise RuntimeError("stop here")

        h.worker.deps = replace(h.worker.deps, bedrock=lambda config, kind: Bedrock())
        h.run()
        assert bedrock_calls == ["eu.anthropic.claude-opus-5-5"]
        assert h.secret_reads == [] and h.clients == [] and h.openai.calls == []
        line = h.logger.lines()[-1]
        assert (line["provider"], line["model"], line["code"]) == ("bedrock", "eu.anthropic.claude-opus-5-5",
                                                                    "bedrock_error")  # fmt: skip


def test_the_providers_are_terraforms() -> None:
    variables = (REPO_ROOT / "infrastructure" / "main" / "variables.tf").read_text(encoding="utf-8")
    block = variables[variables.index('variable "picture_provider"') :]
    block = block[: block.index("\n}\n")]
    allowed = re.search(r"contains\(\[([^\]]*)\], var\.picture_provider\)", block).group(1)  # type: ignore[union-attr]
    assert tuple(re.findall(r'"([a-z]+)"', allowed)) == gen.PROVIDERS
    assert re.search(r'default\s*=\s*"openai"', block)


# --- The real SDK ----------------------------------------------------------------------------------------------------


def test_the_real_sdk_client_is_built_from_the_config_without_calling_anything() -> None:
    pytest.importorskip("openai")
    client = gen.openai_client(CONFIG, "activity-object", KEY)
    assert type(client).__name__ == "OpenAI"
    assert str(client.base_url).rstrip("/") == "https://eu.api.openai.com/v1"
    assert client.max_retries == 1
    assert client.timeout.read == 280.0 and client.timeout.connect == 10.0
    background = gen.openai_client(CONFIG, "background", KEY)
    assert background.max_retries == 0  # one attempt: a retry of a 10-minute paid call would not fit
    assert background.timeout.read == 720.0 and background.timeout.connect == 10.0


def sse(*events: dict[str, Any]) -> bytes:
    return "".join(f"event: {e['type']}\ndata: {json.dumps(e)}\n\n" for e in events).encode()


def canned_stream(text: str, *, status: str = "completed", reason: str | None = None) -> bytes:
    """A Responses event stream as OpenAI sends it: created, a reasoning item, a message whose text arrives in
    deltas, and a terminal event with the usage."""
    base = {
        "id": "resp_test",
        "object": "response",
        "created_at": 1795000000,
        "model": "gpt-6.1-sol",
        "parallel_tool_calls": False,
        "tool_choice": "auto",
        "tools": [],
        "store": False,
    }
    reasoning = {"id": "rs_1", "type": "reasoning", "summary": [], "status": "completed"}
    part = {"type": "output_text", "text": "", "annotations": [], "logprobs": []}
    done_part = {**part, "text": text}
    message = {"id": "msg_1", "type": "message", "role": "assistant", "status": "in_progress", "content": []}
    done_message = {**message, "status": "completed", "content": [done_part]}
    final = {
        **base,
        "status": status,
        "output": [reasoning, done_message],
        "incomplete_details": {"reason": reason} if reason else None,
        "usage": {
            "input_tokens": 9200,
            "input_tokens_details": {"cached_tokens": 8960, "cache_write_tokens": 0},
            "output_tokens": 4100,
            "output_tokens_details": {"reasoning_tokens": 3500},
            "total_tokens": 13300,
        },
    }
    half = len(text) // 2
    seq = iter(range(100))
    return sse(
        {"type": "response.created", "sequence_number": next(seq), "response": {**base, "status": "in_progress",
                                                                                 "output": []}},
        {"type": "response.output_item.added", "sequence_number": next(seq), "output_index": 0,
         "item": {**reasoning, "status": "in_progress"}},
        {"type": "response.output_item.done", "sequence_number": next(seq), "output_index": 0, "item": reasoning},
        {"type": "response.output_item.added", "sequence_number": next(seq), "output_index": 1, "item": message},
        {"type": "response.content_part.added", "sequence_number": next(seq), "output_index": 1, "content_index": 0,
         "item_id": "msg_1", "part": part},
        {"type": "response.output_text.delta", "sequence_number": next(seq), "output_index": 1, "content_index": 0,
         "item_id": "msg_1", "delta": text[:half], "logprobs": []},
        {"type": "response.output_text.delta", "sequence_number": next(seq), "output_index": 1, "content_index": 0,
         "item_id": "msg_1", "delta": text[half:], "logprobs": []},
        {"type": "response.output_text.done", "sequence_number": next(seq), "output_index": 1, "content_index": 0,
         "item_id": "msg_1", "text": text, "logprobs": []},
        {"type": "response.content_part.done", "sequence_number": next(seq), "output_index": 1, "content_index": 0,
         "item_id": "msg_1", "part": done_part},
        {"type": "response.output_item.done", "sequence_number": next(seq), "output_index": 1, "item": done_message},
        {"type": f"response.{status}", "sequence_number": next(seq), "response": final},
    )  # fmt: skip


class Recorder:
    """httpx2.MockTransport's handler: answers with a canned body and records each request."""

    def __init__(self, status: int, body: bytes, content_type: str) -> None:
        self.status, self.body, self.content_type = status, body, content_type
        self.requests: list[Any] = []

    def __call__(self, request: Any) -> Any:
        import httpx2

        self.requests.append(request)
        return httpx2.Response(self.status, content=self.body, headers={"content-type": self.content_type})


def real_sdk_harness(h: Harness, recorder: Recorder) -> None:
    openai = pytest.importorskip("openai")
    httpx2 = pytest.importorskip("httpx2")

    def client(config: Any, kind: str, api_key: str) -> Any:
        h.clients.append((kind, api_key))
        real = gen.openai_client(config, kind, api_key)  # the handler's own settings, then a mock transport
        return openai.OpenAI(
            api_key=api_key,
            base_url=config.openai_base_url,
            timeout=real.timeout,
            max_retries=0,
            http_client=httpx2.Client(transport=httpx2.MockTransport(recorder)),
        )

    h.worker.deps = replace(h.worker.deps, openai=client)


def test_the_real_sdk_streams_a_canned_response_into_result_json(h: Harness) -> None:
    recorder = Recorder(200, canned_stream(DRAWING), "text/event-stream")
    real_sdk_harness(h, recorder)
    assert h.run() == {"batchItemFailures": []}
    result = h.read("result.json")
    assert h.read("error.json") is None, h.logger.lines()
    assert result["svg"] == sanitise(DRAWING).svg
    assert result["usage"] == {"input": 9200, "output": 4100, "cacheRead": 8960, "cacheWrite": 0}
    assert (result["stopReason"], result["model"]) == ("completed", "gpt-6.1-sol")
    assert h.read("progress.json")["phase"] == "drawing"
    [request] = recorder.requests
    assert str(request.url) == "https://eu.api.openai.com/v1/responses"
    assert request.headers["authorization"] == f"Bearer {KEY}"
    sent = json.loads(request.content)
    assert sent["stream"] is True and sent["store"] is False
    assert sent["model"] == "gpt-6.1-sol"
    assert sent["max_output_tokens"] == 24000
    assert sent["reasoning"] == {"effort": "medium"}
    assert sent["prompt_cache_key"] == "picture-gen:activity-object:v1"
    assert sent["instructions"] == gen.instructions("activity-object")
    assert sent["input"] == "<request>a friendly yellow sun</request>"
    line = h.logger.lines()[-1]
    assert (line["provider"], line["result"], line["cacheReadTokens"]) == ("openai", "OK", 8960)


def test_the_real_sdk_incomplete_response_is_too_long(h: Harness) -> None:
    recorder = Recorder(200, canned_stream(DRAWING[:80], status="incomplete", reason="max_output_tokens"),
                        "text/event-stream")  # fmt: skip
    real_sdk_harness(h, recorder)
    h.run()
    assert h.read("error.json") == {"code": "too_long"}
    line = h.logger.lines()[-1]
    assert (line["stopReason"], line["outputTokens"]) == ("max_output_tokens", 4100)


def test_the_real_sdk_401_is_not_set_up_and_never_logs_the_key(h: Harness) -> None:
    body = json.dumps(
        {
            "error": {
                "message": f"Incorrect API key provided: {KEY}.",
                "type": "invalid_request_error",
                "code": "invalid_api_key",
                "param": None,
            }
        }
    ).encode()
    recorder = Recorder(401, body, "application/json")
    real_sdk_harness(h, recorder)
    h.run()
    assert h.read("error.json") == {"code": "not_set_up"}
    line = h.logger.lines()[-1]
    assert (line["errorType"], line["upstreamStatus"], line["upstreamError"]) == (
        "AuthenticationError",
        401,
        "invalid_api_key",
    )
    assert KEY not in h.everything_written()
    assert len(recorder.requests) == 1  # never retried


def test_the_real_sdk_429_is_throttled(h: Harness) -> None:
    body = json.dumps({"error": {"message": "slow down", "type": "requests", "code": "rate_limit_exceeded"}}).encode()
    real_sdk_harness(h, Recorder(429, body, "application/json"))
    h.run()
    assert h.read("error.json") == {"code": "throttled"}


def test_the_real_sdk_timeout_is_timed_out(h: Harness) -> None:
    httpx2 = pytest.importorskip("httpx2")

    def slow(request: Any) -> Any:
        raise httpx2.ReadTimeout("timed out", request=request)

    real_sdk_harness(h, Recorder(200, b"", "text/event-stream"))
    openai = pytest.importorskip("openai")
    h.worker.deps = replace(
        h.worker.deps,
        openai=lambda config, kind, key: openai.OpenAI(
            api_key=key,
            base_url=config.openai_base_url,
            max_retries=0,
            http_client=httpx2.Client(transport=httpx2.MockTransport(slow)),
        ),
    )
    h.run()
    assert h.read("error.json") == {"code": "timed_out"}
    assert h.logger.lines()[-1]["errorType"] == "APITimeoutError"


def test_terraform_passes_the_provider_settings_and_never_holds_the_key() -> None:
    """picture-gen's environment names every setting the handler reads; no Terraform file creates a secret version,
    so the key never enters the state or a plan (the owner stores it: docs/runbooks/openai-key.md)."""
    tf = (REPO_ROOT / "infrastructure" / "main" / "pictures.tf").read_text(encoding="utf-8")
    module = tf[tf.index('module "picture_gen"') :]
    environment = module[module.index("environment = {") : module.index("}", module.index("environment = {"))]
    for name, value in (
        ("PICTURE_PROVIDER", "var.picture_provider"),
        ("OPENAI_MODEL_ID", "var.openai_model_id"),
        ("OPENAI_BASE_URL", "var.openai_base_url"),
        ("OPENAI_SECRET_ARN", "aws_secretsmanager_secret.openai_api_key.arn"),
        ("BEDROCK_MODEL_ID", "var.bedrock_model_id"),
    ):
        assert re.search(rf"\n\s*{name}\s*=\s*{re.escape(value)}\b", environment), name
    for path in (REPO_ROOT / "infrastructure").rglob("*.tf"):
        if ".terraform" not in path.parts:
            assert "aws_secretsmanager_secret_version" not in path.read_text(encoding="utf-8"), path

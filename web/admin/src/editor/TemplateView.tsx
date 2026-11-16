// A template activity (Phase 41, C25): its questions are generated on the server, so the structured editor cannot
// change it. Templates are written as seed files (content/seed/activities/, D §D8.6) for now; this page shows what the
// template is and lets the operator run admin-api's full check (R26), which reports how many questions the template
// makes and shows five of them (the smallest, three middle and the largest) with their answers.
import { useState } from "react";
import { describeError, type AdminApi, type Definition, type Validation } from "../api";
import { describeProblem } from "./problems";

type Props = {
  readonly api: AdminApi;
  readonly activityId: string;
  readonly definition: Definition;
  readonly draftRevision: number;
};

type Template = { generatorKind?: unknown; generatorVersion?: unknown; domain?: unknown; presentation?: unknown };

export function TemplateView({ api, activityId, definition, draftRevision }: Props) {
  const [result, setResult] = useState<Validation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const template = (typeof definition.template === "object" && definition.template !== null ? definition.template : {}) as Template;

  const check = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await api.validate(activityId, draftRevision));
    } catch (failure) {
      setError(describeError(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Template">
      <h2>{definition.title}</h2>
      <p className="notice">
        This activity is a template: the server makes its questions with the generator {String(template.generatorKind ?? "?")} (version{" "}
        {String(template.generatorVersion ?? "?")}). The editor cannot change a template; edit its seed file instead.
      </p>
      <dl>
        <dt>Interaction type</dt>
        <dd>{definition.interactionType}</dd>
        <dt>Ages</dt>
        <dd>
          {definition.minAge === definition.maxAge ? definition.minAge : `${definition.minAge}–${definition.maxAge}`}
        </dd>
      </dl>
      <details>
        <summary>Template settings (read only)</summary>
        <pre>{JSON.stringify({ domain: template.domain, presentation: template.presentation }, null, 2)}</pre>
      </details>
      <div className="actions">
        <button type="button" onClick={() => void check()} disabled={busy}>
          Check the template
        </button>
        {error !== null && (
          <span className="error" role="status">
            {" "}
            {error}
          </span>
        )}
      </div>
      {result !== null && (
        <div role="status">
          <p className={result.valid ? "ok" : "error"}>
            {result.domainSize ?? 0} questions checked, {result.problems.length === 0 ? "no problems" : `${result.problems.length} problem(s)`}.
          </p>
          {result.problems.length > 0 && (
            <ul className="problems">
              {result.problems.map((p) => (
                <li key={`${p.field}:${p.rule}`}>
                  {describeProblem(p)} <small className="muted mono">{p.field}</small>
                </li>
              ))}
            </ul>
          )}
          {(result.sample ?? []).length > 0 && (
            <table>
              <caption>Sample questions</caption>
              <thead>
                <tr>
                  <th scope="col">Question</th>
                  <th scope="col">Accepted answer</th>
                </tr>
              </thead>
              <tbody>
                {(result.sample ?? []).map((s) => (
                  <tr key={s.index}>
                    <td>{s.prompt.text}</td>
                    <td className="mono">{s.answerSpecification.accepted.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}

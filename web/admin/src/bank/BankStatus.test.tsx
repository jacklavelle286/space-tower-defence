// @vitest-environment jsdom
// The bank-status page (A10, D §D8.5; Phase 42): one R30 request, one card per age with its mode, the six counts
// against the thresholds and plainly what to add. Refresh asks again; an error reads through describeError.
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ApiError } from "../api";
import { FakeAdminApi } from "../testing/fakeApi";
import { BankStatus } from "./BankStatus";

let fake: FakeAdminApi;

beforeEach(() => {
  fake = new FakeAdminApi();
});
afterEach(cleanup);

describe("bank status page", () => {
  it("shows each age's mode, counts and what to add", async () => {
    render(<BankStatus api={fake.api} />);
    const five = await screen.findByRole("article", { name: /Reception/u });
    expect(within(five).getByText("Starter rules")).toBeTruthy();
    expect(screen.getByRole("note").textContent).toMatch(/starter rules/u);

    const table = within(five).getByRole("table", { name: "Reception counts" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(6);
    const cells = within(rows[0]!)
      .getAllByRole("cell")
      .map((c) => c.textContent);
    expect(cells).toEqual(["maths", "normal", "12", "34", "2", "22 more"]);
    expect(within(rows[1]!).getAllByRole("cell").at(-1)!.textContent).toBe(
      "enough",
    ); // maths meteor 12 of 4

    const todo = within(five).getByRole("list", {
      name: "What to add for Reception",
    });
    expect(within(todo).getAllByRole("listitem")[0]!.textContent).toBe(
      "22 more maths activities for normal slots (Normal or Both): 12 of 34.",
    );
    expect(todo.textContent).toMatch(/Topics with none yet: /u);

    const six = screen.getByRole("article", { name: /Year 1/u });
    expect(within(six).getByText("Ready")).toBeTruthy();
    expect(
      within(six).getByText("Nothing: Year 1 meets every threshold."),
    ).toBeTruthy();
    const seven = screen.getByRole("article", { name: /Year 2/u });
    expect(
      within(seven).getByText(/nothing is published for Year 2/u),
    ).toBeTruthy();
    expect(fake.callsNamed("bankStatus")).toHaveLength(1);
    expect(
      within(table).getByRole("columnheader", { name: "Counted" }),
    ).toBeTruthy();
    expect(within(five).getAllByText(/not met/u).length).toBeGreaterThan(0); // pass or fail in words, not only a glyph
    expect(screen.getByRole("status").textContent).toBe(
      "Bank status is up to date.",
    );
    expect(screen.queryByText(/released game could not be read/u)).toBeNull();
  });

  it("says when the released game could not be read", async () => {
    fake.bank = { ...fake.bank, releasedWaveSets: null };
    render(<BankStatus api={fake.api} />);
    expect(
      await screen.findByText(/released game could not be read/u),
    ).toBeTruthy();
  });

  it("asks again on Refresh and shows a refusal in words", async () => {
    render(<BankStatus api={fake.api} />);
    await screen.findByRole("article", { name: /Reception/u });
    fake.bank = {
      ...fake.bank,
      ageBands: fake.bank.ageBands.map((b) => ({
        ...b,
        mode: "READY",
        eligible: true,
        needs: [],
      })),
    };
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(screen.getAllByText("Ready")).toHaveLength(3));
    expect(fake.callsNamed("bankStatus")).toHaveLength(2);

    fake.api.bankStatus = () => Promise.reject(new ApiError(403, "FORBIDDEN"));
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect((await screen.findByRole("alert")).className).toBe("error");
  });
});

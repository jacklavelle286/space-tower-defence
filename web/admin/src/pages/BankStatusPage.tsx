// A10 bank status (D §D8.5): a placeholder until Phase 42 (M3-07) builds selection and R30
// `GET /api/admin/bank-status`. R30 answers 501 today, so this page sends no request at all.

const AGES = [5, 6, 7] as const;

export function BankStatusPage() {
  return (
    <section aria-labelledby="bank-heading">
      <h2 id="bank-heading">Bank status</h2>
      <div className="placeholder" role="note">
        <p>
          <strong>Placeholder.</strong> Nothing on this page is real data yet.
        </p>
        <p>
          Bank status arrives with selection in Phase 42. It will show, for each age (5, 6, 7), subject and reward
          category: how many published activities there are, the threshold and hard minimum, and whether that age is{" "}
          <em>Eligible</em> or <em>Not ready</em> for new games.
        </p>
      </div>
      <table className="ghost" aria-label="Bank status layout (no data yet)">
        <thead>
          <tr>
            <th scope="col">Age</th>
            <th scope="col">Subject</th>
            <th scope="col">Category</th>
            <th scope="col">Units</th>
            <th scope="col">Threshold</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {AGES.map((age) => (
            <tr key={age}>
              <td>{age}</td>
              <td>—</td>
              <td>—</td>
              <td>—</td>
              <td>—</td>
              <td>not built yet</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

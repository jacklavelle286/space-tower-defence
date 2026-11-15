# Runbook: DNS hand-off for `aliens.jackgl.com`

DNS for `jackgl.com` is yours. This stack creates **no** Route 53 zone or record, in any account
([H §H.15](../plan/H-infrastructure-and-delivery.md#h15-dns-hand-off), [E §E.3.3](../plan/E-architecture.md#e33-dns-integration-points-no-redesign)).
Terraform gives you the values; you create the records by hand. J tasks M0-04 and M1-03.

## Where things are

| What | Where | Label |
|---|---|---|
| Workload (certificate, later the distributions) | account `263185198757`, profile `space-tower-defence`. The certificate is in **us-east-1** | **[VERIFIED]** env files |
| Public hosted zone `jackgl.com` | zone `Z015416730SXD3BLJNAR2` in account `060421969689`, profile `productivity-prod` | **[VERIFIED]** 2026-11-15, `aws route53 list-resource-record-sets` |
| Apex site | CloudFront `E3KDODDNQ8QYZM` (`d1drwnl9tegfhe.cloudfront.net`) in account `060421969689` | **[VERIFIED]** 2026-11-15 |
| Who creates records | You, in the Route 53 console or with the CLI below | **[CONFIRMED]** `prompt.md:27`, `prompt.md:822` |
| No Terraform DNS provider in this repo; the pipeline never touches DNS | Changing that needs an ADR (see [the last section](#moving-the-zone-to-a-shared-dns-account)) | **[PROPOSAL]** [E §E.3.3](../plan/E-architecture.md#e33-dns-integration-points-no-redesign) |
| Domain registrar | Amazon Registrar (Route 53 Domains) in account `060421969689`; DNSSEC not signing | **[VERIFIED]** 2026-11-15, `aws route53domains get-domain-detail`, `aws route53 get-dnssec` |

The zone will later move to a shared DNS account; see [Moving the zone](#moving-the-zone-to-a-shared-dns-account).

## The four records

| # | Record you create | Type | Value comes from | When |
|---|---|---|---|---|
| 1 | `_<token>.aliens.jackgl.com.` (validation for `aliens.jackgl.com`) | CNAME | `terraform output acm_validation_records`, or `aws acm describe-certificate` while the first apply waits | Phase 2, during the interim pipeline's apply |
| 2 | `_<token>.admin.aliens.jackgl.com.` (validation for `admin.aliens.jackgl.com`) | CNAME | same | same |
| 3 | `aliens.jackgl.com` | A **and** AAAA alias | `player_distribution_domain`; alias zone `cloudfront_hosted_zone_id` = `Z2FDTNDATAQYW2`; evaluate target health = no | Phase 4, after the first `apply.yml` succeeds |
| 4 | `admin.aliens.jackgl.com` | A **and** AAAA alias | `admin_distribution_domain`; same zone ID | Phase 4, same |

The `<token>` parts and the CNAME values (ending `.acm-validations.aws.`) are only known once ACM has received the request, so
they cannot be written down here in advance. Records 3 and 4 use outputs that Phase 3 adds.

**Keep records 1 and 2 forever.** ACM renews the certificate automatically only while they resolve. Deleting them means the
certificate expires at the end of its current validity period and both sites stop working. The exact date is the certificate's
`NotAfter` (`aws acm describe-certificate ... --query Certificate.NotAfter`); public certificate lifetimes are shrinking under the
CA/Browser Forum schedule, so expect months, not years. Read 2026-11-15 (`aws acm list-certificates`, us-east-1): `NotAfter`
2027-06-01 **[VERIFIED]** (register U-057).

Nothing else needs DNS: the API is same-origin (`/api/*` on each site), the Cognito sign-in pages use
`scd-aliens-play.auth.eu-west-2.amazoncognito.com` and `scd-aliens-admin.auth.eu-west-2.amazoncognito.com`, and the audio bucket
uses its regional S3 endpoint.

## Phase 2: validation CNAMEs (records 1 and 2)

Done in Phase 2, through the interim workflow `terraform-per-env` (`tf-apply-destroy-env.yml`, deleted in Phase 4). The steps
stay as a record. If the certificate ever has to be requested again, the same steps apply with `release.yml` then `apply.yml`
in place of the interim `plan` and `apply` dispatches.

1. Run DNS-2 and DNS-3 below if more than a few days have passed since the results recorded here.
2. Dispatch `terraform-per-env` with `action = plan`. The plan should show `module.certificate.aws_acm_certificate.this` and
   `module.certificate.aws_acm_certificate_validation.this` to add, and nothing else.
3. Dispatch it again with `action = apply`. The log prints
   `module.certificate.aws_acm_certificate.this: Creation complete after …s [id=arn:aws:acm:us-east-1:263185198757:certificate/…]`,
   then `aws_acm_certificate_validation.this: Still creating...` every few seconds. It waits up to 30 minutes (the job's limit is 60).
4. While it waits, read the two records (read-only, workload account). Outputs do not exist yet, so ask ACM:

   ```sh
   # ARN: copy it from the log line above, or look it up
   aws acm list-certificates --region us-east-1 --profile space-tower-defence \
     --query "CertificateSummaryList[?DomainName=='aliens.jackgl.com'].[CertificateArn,Status]" --output text

   aws acm describe-certificate --region us-east-1 --profile space-tower-defence \
     --certificate-arn <arn> \
     --query "Certificate.DomainValidationOptions[].[DomainName,ResourceRecord.Name,ResourceRecord.Type,ResourceRecord.Value]" \
     --output table
   ```

   If `ResourceRecord` is empty, wait a few seconds and run it again; ACM fills it in shortly after the request.

5. Create both CNAMEs in the DNS account. Console: Route 53 → Hosted zones → `jackgl.com` → Create record → Record type CNAME,
   record name = the part before `.jackgl.com.`, value = the `.acm-validations.aws.` value, TTL 300. Or the CLI, with the values
   from step 4 pasted in:

   ```sh
   cat > /tmp/acm-validation.json <<'JSON'
   {
     "Comment": "ACM validation for aliens.jackgl.com and admin.aliens.jackgl.com (space-tower-defence). Keep forever.",
     "Changes": [
       {
         "Action": "CREATE",
         "ResourceRecordSet": {
           "Name": "_<token-1>.aliens.jackgl.com.",
           "Type": "CNAME",
           "TTL": 300,
           "ResourceRecords": [{ "Value": "_<value-1>.<id>.acm-validations.aws." }]
         }
       },
       {
         "Action": "CREATE",
         "ResourceRecordSet": {
           "Name": "_<token-2>.admin.aliens.jackgl.com.",
           "Type": "CNAME",
           "TTL": 300,
           "ResourceRecords": [{ "Value": "_<value-2>.<id>.acm-validations.aws." }]
         }
       }
     ]
   }
   JSON

   aws route53 change-resource-record-sets --profile productivity-prod \
     --hosted-zone-id Z015416730SXD3BLJNAR2 --change-batch file:///tmp/acm-validation.json
   ```

   `CREATE`, not `UPSERT`: `CREATE` fails if a record with that name already exists, so a typo can never replace an existing
   record. That is the CLI form of "never `allow_overwrite`".

6. Confirm (read-only):

   ```sh
   dig +short CNAME _<token-1>.aliens.jackgl.com
   aws acm describe-certificate --region us-east-1 --profile space-tower-defence \
     --certificate-arn <arn> --query Certificate.Status --output text   # PENDING_VALIDATION, then ISSUED
   ```

   ACM normally issues within minutes of the records resolving. The apply then finishes and prints
   `acm_validation_records` (the same two records), `certificate_arn` and `acm_certificate_status`. That last output shows the
   status at the moment the certificate was requested (`PENDING_VALIDATION`); the next plan refreshes it to `ISSUED`.
   `describe-certificate` is the authority.

**If the 30 minutes run out**, the apply fails part-way. State is saved and the certificate request survives. Create the records
if you have not, then dispatch `plan` and `apply` again; the validation returns at once once ACM shows `ISSUED`. Nothing needs
cleaning up. ACM itself gives up on an unvalidated request after 72 hours; after that, the certificate request must be replaced
through the pipeline, so do not leave it that long. Re-check the validation records with `describe-certificate` afterwards: for
the same names in the same account ACM normally gives the same CNAMEs, so records you already created usually need no change.

## Phase 4: alias records (records 3 and 4)

Four records: A and AAAA (IPv6 is on) for each hostname, each an alias to that site's distribution. Create them **only after
`apply.yml` has succeeded**: before that the distributions, and so the alias targets, do not exist. A record that points at a
distribution which does not list the hostname as an alternate domain name just returns errors; a distribution that does list it
is exactly what the apply creates.

1. **Get the two distribution domains** (read-only, workload account). Either from the apply run's summary ("Applied plan N"
   table: `player_distribution_domain`, `admin_distribution_domain`, `cloudfront_hosted_zone_id`), or:

   ```sh
   aws cloudfront list-distributions --profile space-tower-defence \
     --query "DistributionList.Items[].[Aliases.Items[0],DomainName,Status]" --output table
   ```

   Expect `aliens.jackgl.com` and `admin.aliens.jackgl.com`, each with a `d…cloudfront.net` domain and status `Deployed`.
   Check each answers before creating any record:

   ```sh
   curl -sI https://<player-domain>.cloudfront.net/ | head -1        # HTTP/2 200
   curl -sI https://<admin-domain>.cloudfront.net/ | head -1         # HTTP/2 200
   ```

2. **Check nothing exists yet for the two names** (DNS account, read-only). Both commands should print nothing:

   ```sh
   aws route53 list-resource-record-sets --profile productivity-prod --hosted-zone-id Z015416730SXD3BLJNAR2 \
     --query "ResourceRecordSets[?Name=='aliens.jackgl.com.' || Name=='admin.aliens.jackgl.com.']" --output text
   dig +short aliens.jackgl.com; dig +short admin.aliens.jackgl.com
   ```

3. **Create the four records** in one change batch. Replace the two `<…>` domains with step 1's values (keep the trailing dot).
   `Z2FDTNDATAQYW2` is CloudFront's fixed alias zone ID (the `cloudfront_hosted_zone_id` output); it is **not** the
   `jackgl.com` zone, which goes in `--hosted-zone-id`.

   ```sh
   cat > /tmp/aliens-alias.json <<'JSON'
   {
     "Comment": "Alias records for aliens.jackgl.com and admin.aliens.jackgl.com (space-tower-defence), after the first apply.",
     "Changes": [
       {
         "Action": "CREATE",
         "ResourceRecordSet": {
           "Name": "aliens.jackgl.com.",
           "Type": "A",
           "AliasTarget": { "HostedZoneId": "Z2FDTNDATAQYW2", "DNSName": "<player-domain>.cloudfront.net.", "EvaluateTargetHealth": false }
         }
       },
       {
         "Action": "CREATE",
         "ResourceRecordSet": {
           "Name": "aliens.jackgl.com.",
           "Type": "AAAA",
           "AliasTarget": { "HostedZoneId": "Z2FDTNDATAQYW2", "DNSName": "<player-domain>.cloudfront.net.", "EvaluateTargetHealth": false }
         }
       },
       {
         "Action": "CREATE",
         "ResourceRecordSet": {
           "Name": "admin.aliens.jackgl.com.",
           "Type": "A",
           "AliasTarget": { "HostedZoneId": "Z2FDTNDATAQYW2", "DNSName": "<admin-domain>.cloudfront.net.", "EvaluateTargetHealth": false }
         }
       },
       {
         "Action": "CREATE",
         "ResourceRecordSet": {
           "Name": "admin.aliens.jackgl.com.",
           "Type": "AAAA",
           "AliasTarget": { "HostedZoneId": "Z2FDTNDATAQYW2", "DNSName": "<admin-domain>.cloudfront.net.", "EvaluateTargetHealth": false }
         }
       }
     ]
   }
   JSON

   aws route53 change-resource-record-sets --profile productivity-prod \
     --hosted-zone-id Z015416730SXD3BLJNAR2 --change-batch file:///tmp/aliens-alias.json
   ```

   `CREATE` again, never `UPSERT` (DNS-1): if any of the four already exists the whole batch fails and nothing changes. The
   command prints a change ID; `aws route53 get-change --profile productivity-prod --id <id>` shows `INSYNC` within a minute.
   Console alternative: Create record → name `aliens` (then `admin.aliens`) → type A → Alias on → "Alias to CloudFront
   distribution" → pick the distribution → Evaluate target health off; repeat with type AAAA.

4. **Verify** (read-only):

   ```sh
   dig +short A aliens.jackgl.com; dig +short AAAA aliens.jackgl.com              # CloudFront addresses
   dig +short A admin.aliens.jackgl.com; dig +short AAAA admin.aliens.jackgl.com
   curl -sI https://aliens.jackgl.com/ | head -1                                    # HTTP/2 200
   curl -sI https://aliens.jackgl.com/index.html | grep -i cache-control            # cache-control: no-cache
   curl -sI https://admin.aliens.jackgl.com/ | head -1                              # HTTP/2 200
   curl -s https://aliens.jackgl.com/config.json                                    # {"apiBase":"/api","releaseId":"…"}
   curl -sv https://aliens.jackgl.com/ -o /dev/null 2>&1 | grep -E 'subject:|issuer:'  # CN=aliens.jackgl.com, Amazon
   ```

   Or run the release's own smoke checks from the laptop (plain HTTPS GETs, no AWS credentials; the release ID is in
   `config.json`):

   ```sh
   python3 scripts/smoke.py --release-id <release_id> --hostname-mode require \
     --site player <player-domain>.cloudfront.net aliens.jackgl.com \
     --site admin <admin-domain>.cloudfront.net admin.aliens.jackgl.com
   ```

   Then open both sites in a browser and check the padlock shows the certificate for `aliens.jackgl.com`.

5. **Check the apex still answers as before** (DNS-1). Only the four new records may have appeared:

   ```sh
   curl -sI https://jackgl.com/ | head -1; curl -sI https://www.jackgl.com/ | head -1
   aws route53 list-resource-record-sets --profile productivity-prod --hosted-zone-id Z015416730SXD3BLJNAR2 \
     --query "ResourceRecordSets[].[Name,Type]" --output text
   ```

   Expected: the apex A, `www` A, NS, SOA, the two apex ACM CNAMEs, our two validation CNAMEs and the four new aliases.

6. **Make the hostname smoke checks count.** The first apply could only report the hostnames as "skipped: DNS not live"
   ([H §H.8.6](../plan/H-infrastructure-and-delivery.md#h86-smoke-checks-step-7-read-only)). Dispatch `release.yml` and then
   `apply.yml` once more (the plan should show no changes). That release's smoke job finds the hostnames resolving, so it must
   pass on them; its `releases/latest.json` then records `hostnamesLive: true`, and every later release fails if either hostname
   stops answering. This second release is the Phase 4 exit evidence "smoke green on both hostnames".

To undo (only if something is wrong before anyone uses the sites): the same change batch with `"Action": "DELETE"` and the same
values removes exactly these four records.

## Checks

Results recorded 2026-11-15, read-only.

| # | Check | How | Result | Label |
|---|---|---|---|---|
| DNS-1 | Never create, change or delete the apex `jackgl.com` or `www.jackgl.com` records, or the existing ACM validation CNAMEs `_5d930172cdd49cd5eb22d844a8f10254.jackgl.com.` and `_94dcb7933d37d4527f7c5de89f6499cc.www.jackgl.com.` (they renew the apex site's certificate). Never `UPSERT` or `allow_overwrite` | Rule | Zone today: apex A alias, `www` A alias, NS, SOA and those two CNAMEs, nothing else | **[CONFIRMED by owner]** rule; **[VERIFIED]** record list |
| DNS-2 | CAA records on `jackgl.com` must allow `amazon.com` | `dig +short CAA jackgl.com` | No CAA records, so any CA (including Amazon) may issue | **[VERIFIED]** 2026-11-15 |
| DNS-3 | The apex CloudFront distribution must not claim `*.jackgl.com` | `aws cloudfront get-distribution-config --id E3KDODDNQ8QYZM --profile productivity-prod --query DistributionConfig.Aliases` | `jackgl.com`, `www.jackgl.com` only; no wildcard | **[VERIFIED]** 2026-11-15 |
| DNS-4 | Apex cookies scoped to `.jackgl.com` would reach our subdomains | `curl -sI https://jackgl.com`, `curl -sI https://www.jackgl.com` | No `Set-Cookie` on either response. Harmless either way: our APIs use bearer tokens, not cookies | **[VERIFIED]** 2026-11-15 (response headers only; cookies set later by the apex app's scripts were not checked) |
| DNS-5 | HSTS `includeSubDomains` on the apex would force HTTPS on our subdomains | same `curl` | No `Strict-Transport-Security` header. Fine either way: both our hostnames are HTTPS-only | **[VERIFIED]** 2026-11-15 |
| — | Our hostnames are unused | `dig +short aliens.jackgl.com`, `dig +short admin.aliens.jackgl.com` | Neither resolves | **[VERIFIED]** 2026-11-15 |

Re-run DNS-2 and DNS-3 before Phase 4 if anything changed on the apex site in the meantime: a wildcard alias added there later
would stop our distributions from taking their aliases.

## Moving the zone to a shared DNS account

You plan to move `jackgl.com` to a shared DNS account. When you do:

1. Copy every record into the new zone first **except the apex NS and SOA** (the new zone has its own). That includes records
   1 to 4 here and the apex site's records and ACM CNAMEs.
2. Check DNSSEC first: today the zone is `NOT_SIGNING`, so it adds no step. If signing has been enabled by then, plan the key
   handover before switching.
3. Optional: lower the TTL of the domain's NS records (currently 172800 s, 2 days) a few days ahead for a quicker cutover.
4. Change the domain's name servers to the new zone's NS set. The registrar is Route 53 Domains in account `060421969689`, so
   change them there, or transfer the domain registration to the new account first and change them there.
5. Keep the old zone in place and unchanged for at least the old NS TTL (currently 2 days) after the switch; only then delete it.
6. Update the "Where things are" table above (zone ID, account, profile).

Nothing in this repository changes: the stack has no DNS provider and no zone lookup. If you later want Terraform to manage these
records, that is a new decision (an ADR), with a DNS-account provider alias in `infrastructure/main/provider.tf` as the single place
it would go ([H §H.3.1](../plan/H-infrastructure-and-delivery.md#h31-providertf)).

"""Spike pre sign-up trigger for the throwaway player pool (M0-10).

Production (spine S1.2) counts sign-ups per UTC day in DynamoDB and raises at the cap. This spike only needs to see
two things on managed login: what an auto-confirmed sign-up looks like, and how a raised error is shown. So it does not
count: CAP == 0 refuses every self sign-up, any other value confirms it. It never returns autoConfirmUser = False,
which would leave an UNCONFIRMED user behind (the production rule: fail closed by raising).
"""

import os

# Child-safe wording; Cognito shows it after its own prefix (the spike records exactly how).
CAP_MESSAGE = "Sign-ups are closed for today. Please ask a grown-up."


def handler(event, context):
    source = event.get("triggerSource")
    if source != "PreSignUp_SignUp":
        # PreSignUp_AdminCreateUser and others pass through uncounted, as in production.
        return event

    try:
        cap = int(os.environ.get("CAP", "0"))
    except ValueError:
        cap = 0  # fail closed on a bad setting

    if cap <= 0:
        print("presignup: refused, cap reached")  # no username: it is a child's chosen name
        raise Exception(CAP_MESSAGE)

    event["response"]["autoConfirmUser"] = True
    print("presignup: auto-confirmed")
    return event

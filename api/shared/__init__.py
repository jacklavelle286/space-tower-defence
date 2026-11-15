"""Helpers shared by the four Lambda functions (plan E.6.2).

scripts/build_lambdas.py copies this package into every zip next to the function's handler.py, so a handler imports it
as `shared` both in Lambda and in the tests (api/pyproject.toml puts api/ on the test path).
"""

"""The one British number-word list (C25.2 NUMBER_WORD): 0-100, lower case, tens and ones joined by a hyphen
("forty", "twenty-one", "one hundred"). Fixed text, never built from operator input, so a generator cannot produce
free text (C25.3 rule 5). Reviewed as part of the NUMBER_WORD snapshot."""

from __future__ import annotations

ONES = (
    "zero",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
    "thirteen",
    "fourteen",
    "fifteen",
    "sixteen",
    "seventeen",
    "eighteen",
    "nineteen",
)
TENS = ("", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety")


def number_word(n: int) -> str:
    """The word for a whole number 0-100."""
    if not 0 <= n <= 100:
        raise ValueError("number words cover 0-100")
    if n == 100:
        return "one hundred"
    if n < 20:
        return ONES[n]
    tens, ones = divmod(n, 10)
    return TENS[tens] if ones == 0 else f"{TENS[tens]}-{ONES[ones]}"

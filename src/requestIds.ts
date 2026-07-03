import { customAlphabet } from "nanoid";

const FIRST_CHAR = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const REST_CHARS = `${FIRST_CHAR}_-`;

const firstChar = customAlphabet(FIRST_CHAR, 1);
const restChars = customAlphabet(REST_CHARS, 17);

export function createRequestId(length = 18): string {
  if (length <= 1) return firstChar();
  return `${firstChar()}${restChars(length - 1)}`;
}

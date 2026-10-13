import { uuid } from "../../id";

export type Clip = { key: string; start: string; end: string };
export const clip = (start = "0", end = ""): Clip => ({ key: uuid(), start, end });

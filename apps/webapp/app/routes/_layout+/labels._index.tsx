/** /labels opens the queue. Part of the labels feature; not in upstream Shelf. */
import { redirect } from "react-router";

export const loader = () => redirect("/labels/queue");

/** Small helper that appends the app's name to the current route meta title (fork: Vinventory) */
export const appendToMetaTitle = (title: string | null | undefined) =>
  `${title ? title : "Not found"} | Vinventory`;

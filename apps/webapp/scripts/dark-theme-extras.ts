/**
 * Fork (VinneyUK/shelf.nu): the hand-written part of the dark theme.
 *
 * These are colours the class scan in dark-theme.ts can't see: plain elements
 * (body, headings), CSS files that set colours themselves (global.css, the
 * calendar, the tags input, the notes editor), Shelf's CSS variables for the
 * sidebar, widgets that draw with fixed colours (the hand-made checkbox, the
 * Reports charts), and badges, whose colours come from the user.
 *
 * Specificity note: rules for plain elements use :where() so classes still win.
 */
export const EXTRAS = String.raw`
/* ---- theme variables ---- */
html.dark {
  color-scheme: dark;
  --tw-ring-color: #1e2a3a;
  /* the sidebar reads these (global.css); they were why it stayed white */
  --sidebar-background: #12161b;
  --sidebar-foreground: 215 14% 78%;
  --sidebar-primary: 216 14% 85%;
  --sidebar-primary-foreground: 216 20% 10%;
  --sidebar-accent: 215 16% 15%;
  --sidebar-accent-foreground: 0 0% 98%;
  --sidebar-border: 215 14% 18%;
  scrollbar-color: #39424d #12161b;
}

/* ---- plain elements (global.css styles these with @apply, not classes) ----
   :where() keeps these rules no more specific than the element styles they replace,
   so a class (text-primary, border-transparent...) still wins over them. */
html.dark body { background-color: #0f1216; color: #e5e7eb; }
:where(html.dark) :is(h1, h2, h3, h4, h5, h6) { color: #f3f4f6; }
:where(html.dark) *, :where(html.dark) ::before, :where(html.dark) ::after { border-color: #2b333d; }
/* inputs: a dark background unless a class sets its own (mapped classes are more specific and win;
   bg-transparent is left alone). Matching class tokens exactly: a substring match on "bg-"
   also matched disabled:bg-gray-50, which left most inputs white. */
html.dark :where(
  input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]):not([type="color"]):not([class~="bg-transparent"]),
  textarea:not([class~="bg-transparent"]),
  select:not([class~="bg-transparent"])
) {
  background-color: #161b22;
}
:where(html.dark) :where(input, textarea)::placeholder { color: #6e7682; }
html.dark :where([type="checkbox"], [type="radio"]):not(:checked):not([class~="bg-white"]) { background-color: #161b22; border-color: #4b5360; }
html.dark ::-webkit-scrollbar { background: #12161b; }
html.dark ::-webkit-scrollbar-thumb { background: #39424d; border-radius: 8px; }
html.dark ::-webkit-scrollbar-corner { background: #12161b; }

/* ---- global.css ---- */
html.dark .fixed-gradient { background: linear-gradient(to right, rgba(15, 18, 22, 0) 0%, #0f1216 100%); }
html.dark .spinner:before { border-color: #39424d; }
html.dark .dialog > .scrollable-content::-webkit-scrollbar-thumb { background: #4b5360; }
html.dark .dialog > .scrollable-content::-webkit-scrollbar-track { background: #1c2229; }
html.dark .onboarding-checklist .completed { background-color: #2a1d14; border-color: #ef6820; }
html.dark .onboarding-checklist .completed p,
html.dark .onboarding-checklist .completed h6 { color: #f4b887; }
html.dark .pseudo-border-bottom::after { border-color: #2b333d; }
html.dark .pseudo-border-bottom:hover { background-color: #1c2229; }
html.dark .fill-tremor-content-emphasis { color: #f3f4f6; }
html.dark .sticky-col { background-color: #0f1216; }
html.dark .booking-route-form-wrapper { background-color: #0f1216; }
html.dark .select-trigger span span { color: #8b93a1; }

/* ---- the switch: a light knob on both track colours ---- */
html.dark .switch > span { background-color: #e5e7eb; }

/* ---- the tags input (tags.css) ---- */
html.dark .react-tags { background-color: #161b22; border-color: #39424d; }
html.dark .react-tags.is-active { border-color: #8a5229; }
html.dark .react-tags.is-disabled { background-color: #1c2229; }
html.dark .react-tags__tag { background-color: #1c2229; color: #d1d5db; }
html.dark .react-tags__tag::after { background-color: #6e7682; }
html.dark .react-tags__tag:hover::after { background-color: #a1a8b3; }
html.dark .react-tags__combobox-input::placeholder { color: #6e7682; }
html.dark .react-tags__listbox { background-color: #161b22; border-color: #39424d; }
html.dark .react-tags__listbox-option:hover,
html.dark .react-tags__listbox-option:focus { background-color: #1c2229; }
html.dark .react-tags__listbox-option:not([aria-disabled="true"]).is-active { background-color: #262d36; }
html.dark .react-tags__listbox-option-highlight { background-color: #5a4a00; color: #fff; }

/* ---- the notes editor (pm-doc.css) ---- */
html.dark .pm-doc { color: #e5e7eb; }
html.dark .pm-doc strong { color: #f3f4f6; }
html.dark .pm-doc code { background-color: #1c2229; color: #d1d5db; }
html.dark .pm-doc hr { border-top-color: #2b333d; }
html.dark .pm-doc blockquote { border-left-color: #2b333d; color: #a1a8b3; }
html.dark .pm-doc table td, html.dark .pm-doc table th { border-color: #2b333d; color: #a1a8b3; }
html.dark .pm-doc table th { background-color: #161b22; }

/* ---- the calendar (calendar.css and the date picker) ---- */
html.dark .fc { background-color: #0f1216; color: #e5e7eb; }
html.dark .fc-toolbar { border-color: #39424d !important; }
html.dark .fc-next-button, html.dark .fc-today-button, html.dark .fc-prev-button {
  background-color: #161b22 !important; color: #d1d5db !important; border-color: #39424d !important;
}
html.dark .fc .fc-col-header-cell-cushion, html.dark .fc .fc-daygrid-day-number { color: #d1d5db; }
html.dark .month-view .fc-day-today, html.dark .week-view .fc-day-today { background-color: #2a1d14 !important; }
html.dark .fc-theme-standard .fc-scrollgrid, html.dark .fc-theme-standard td, html.dark .fc-theme-standard th { border-color: #262d36; }
html.dark .rdp-root { color: #e5e7eb; }
html.dark .rdp-day_button { color: #e5e7eb; }
html.dark .rdp-day_button:hover:not([disabled]) { background-color: #1c2229; }
html.dark .rdp-range_end, html.dark .rdp-range_start { background-color: #1c2229; }
html.dark .rdp-range_middle .rdp-day_button:hover { background-color: #262d36 !important; }
html.dark .rdp-selected .rdp-day_button { background-color: #f3f4f6 !important; color: #0f1216 !important; }
html.dark .rdp-outside .rdp-day_button { color: #6e7682; }
html.dark .rdp-disabled .rdp-day_button { color: #55606d; }

/* ---- loading skeletons ---- */
html.dark .post .avatar { background-color: #262d36; background-image: linear-gradient(90deg, #262d36 0px, #2f3741 40px, #262d36 80px); }
html.dark .post .line { background-image: linear-gradient(90deg, #262d36 0px, #2f3741 40px, #262d36 80px); }
html.dark .post .line ~ .line { background-color: #262d36; }

/* ---- colours written into class names as hex ---- */
html.dark [class~="bg-[#FFF8E1]"] { background-color: #2e210d; }
html.dark [class~="border-[#FFE082]"] { border-color: #6b4a12; }
html.dark [class~="border-[#E3E4E8]"] { border-color: #2b333d; }

/* ---- badges: the colours come from the user (a 30% tint, multiplied, with
        text darkened from it). Flipping the lightness keeps the hue and gives a
        dark tint with light text, whatever colour was chosen. ---- */
html.dark [data-badge] { filter: invert(1) hue-rotate(180deg); mix-blend-mode: normal !important; }

/* ---- the placeholder picture for assets and boxes without a photo is a white image ---- */
html.dark img[src*="asset-placeholder"], html.dark img[src*="placeholder-square"] { filter: invert(1) hue-rotate(180deg) brightness(0.9); }

/* ---- Reports area chart draws with fixed dark colours (its tooltip is left alone) ---- */
html.dark .reports-chart .recharts-surface { filter: invert(1) hue-rotate(180deg); }

/* ---- classes with arbitrary variants, which the scan can't turn into rules ---- */
html.dark [cmdk-group-heading] { color: #6e7682; }
html.dark [class~="[&>div>p:first-child]:text-gray-900"] > div > p:first-child { color: #f3f4f6; }
html.dark [class~="[&>div>p:last-child]:text-gray-600"] > div > p:last-child { color: #a1a8b3; }
html.dark [class~="[&:is(button:enabled)]:hover:bg-gray-50"]:is(button:enabled):hover { background-color: #161b22; }
html.dark [class~="[&:is(a)]:hover:bg-gray-50"]:is(a):hover { background-color: #161b22; }

/* ---- the wordmark next to the logo is dark ink ---- */
html.dark [data-shelf-wordmark] path { fill: #f3f4f6; }

/* ---- the hand-drawn checkbox (it fills with currentColor, which was white) ---- */
html.dark [data-fake-checkbox="off"] rect { fill: #161b22; stroke: #4b5360; }
html.dark [data-fake-checkbox="on"] rect:first-of-type { fill: #2a1d14; }

/* ---- the printed-label preview stands for paper, so it stays light ---- */
html.dark [data-keep-light] { color-scheme: light; }
`;

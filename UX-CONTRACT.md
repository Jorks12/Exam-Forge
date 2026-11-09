# ExamForge interaction contract

- Bulgarian is the application locale. Format dates and numbers with `bg-BG`. Use the browser's native input and select semantics.
- The UI kit owns loading, empty, error, confirmation, and pagination states. Use in-context status messages and preserve entered data on failed mutations. Required fields use browser constraint semantics with an application-owned Bulgarian error summary.
- Modal confirmation uses native `dialog.showModal()` with an app-owned title and actions. Cancel restores focus to the invoking control. Disable repeated mutations while a response is pending.
- CRUD returns to the source list after success. Editing preserves existing values. Archiving requires confirmation. Topic deletion is limited to empty topics.
- Selecting an exam answer updates the selection immediately. A separate status distinguishes saving from confirmation. Navigation stays available during writes and submission waits for pending answers. The deadline uses a server-time offset and the backend owns finalization. Result review shows choices, explanations and topic totals.
- `globals.css` owns the scrollbar and focus styles. Charts have adjacent numeric text or accessible table alternatives. History uses responsive rows with named links.
- School catalogue generation requires a grade and subject. An empty topic selection includes all topics in that subject-grade. The number of questions stays within the available count for the filters. Shared questions appear in a read-only list. Personal questions retain their own editing flow.
- Dark is the default appearance. Settings offer dark, light, and system. The browser restores its preference before rendering the page and follows system changes when system mode is selected.
- The root opens Login for every visitor. An authenticated session shows an explicit Continue action and account switch. Protected deep links return to the intended route after authentication. Remember Me controls cookie lifetime.
- Route and step animations use opacity and small transforms and honor reduced motion. Subject selection moves focus to the selected subject without moving the page. Switching sources keeps both compatible form selections.
- Workspace menu links indicate a pending page transition and keep the current-page marker until the destination loads. The local launcher builds the frontend before serving it. The development menu uses document navigation so slow compilation bypasses the development router's suspended transitions.

# Deploying the application to Vercel

Deploy the frontend and Express API together as one Vercel project. The HTML pages are in `public/`, with styles and JavaScript in `public/assets/`; Vercel serves them as static assets. `api/[...path].js` forwards API requests to the Express app. `vercel.json` selects Vercel's **Other** framework preset so it does not route static page requests into the Express function, and maps `/` to the Resume page plus `/surat` and `/cv` to their respective pages.

The profile editor is available on the Resume, Surat Lamaran, and CV pages. The built-in profile, work, education, and skill values are generic examples; visitors can replace them with their own details. Profile values, including any number of work experiences, are saved in the visitor's browser (`localStorage`) and included whenever a document is generated. The Surat Lamaran preview provides image-signature and print-and-sign options; uploaded PNG/JPEG signatures up to 512 KB are stored in that browser. Month/year selectors localize month names to the selected document language. Profile changes are shared across pages in the same browser, but are not shared between different devices or browsers.

The display theme can be switched between light and dark mode from the header. The choice is saved in the visitor's browser, and the document preview remains paper-colored for readability. On smaller screens, the form and preview are stacked vertically.

1. Push the project to a GitHub repository.
2. In Vercel, choose **Add New → Project**, import that repository, and keep the project root at the repository root.
3. Deploy. Vercel detects `vercel.json`, serves the HTML/CSS/JS files, and runs the API as a Node.js serverless function. No separate backend URL or environment variable is needed.
4. Verify the deployment by opening `https://<your-project>.vercel.app/api/health`; it should return `{"status":"ok"}`. Also test the Resume, Surat Lamaran, and CV downloads.

Vercel's serverless Chromium is used for PDF generation. The project requires Node.js 22.17 or later as configured in `package.json`.

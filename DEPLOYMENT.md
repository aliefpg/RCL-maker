# Deploying the application to Vercel

Deploy the frontend and Express API together as one Vercel project. The root HTML/CSS/JS files are served as static assets; `api/[...path].js` forwards API requests to the Express app. `vercel.json` selects Vercel's **Other** framework preset so it does not route static page requests into the Express function, and configures the `/surat` and `/cv` page routes.

The profile editor is available on the Resume, Surat Lamaran, and CV pages. The built-in profile, work, education, and skill values are generic examples; visitors can replace them with their own details. Profile values, including any number of work experiences, are saved in the visitor's browser (`localStorage`) and included whenever a document is generated. Month/year selectors localize month names to the selected document language. Profile changes are shared across pages in the same browser, but are not shared between different devices or browsers.

1. Push the project to a GitHub repository.
2. In Vercel, choose **Add New → Project**, import that repository, and keep the project root at the repository root.
3. Deploy. Vercel detects `vercel.json`, serves the HTML/CSS/JS files, and runs the API as a Node.js serverless function. No separate backend URL or environment variable is needed.
4. Verify the deployment by opening `https://<your-project>.vercel.app/api/health`; it should return `{"status":"ok"}`. Also test the Resume, Surat Lamaran, and CV downloads.

Vercel's serverless Chromium is used for PDF generation. The project requires Node.js 22.17 or later as configured in `package.json`.

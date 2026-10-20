# Deploying the backend to Render

The frontend can stay on Netlify. Render runs the Express API that generates DOCX and PDF files.

The profile editor is available on the Resume, Surat Lamaran, and CV pages. The built-in profile, work, education, and skill values are generic examples; visitors can replace them with their own details. Profile values, including any number of work experiences, are saved in the visitor's browser (`localStorage`) and included whenever a document is generated. Month/year selectors localize month names to the selected document language. Profile changes are shared across pages in the same browser, but are not shared between different devices or browsers.

1. Push the project, including `render.yaml`, to a GitHub repository.
2. In Render, create a new **Blueprint** and select that repository. Render will use `render.yaml` to create the `resume-filler-api` web service.
3. Wait for the first deploy to finish. Open `https://<your-render-service>.onrender.com/api/health`; it should return `{"status":"ok"}`.
4. In this repository, edit `api-config.js` and set `window.API_BASE_URL` to the service's full public URL, for example:

   ```js
   window.API_BASE_URL = 'https://resume-filler-api.onrender.com';
   ```

5. Push the change and redeploy the Netlify site.

Use the Render service URL only, without `/api` or a trailing slash. The first request after an idle period can take longer while a free Render service starts.

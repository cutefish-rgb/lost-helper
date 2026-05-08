# Lost Helper Deployment

Lost Helper is now a no-API-key static web app.

It uses:

- Browser geolocation
- Local storage for saved places
- OpenStreetMap embeds for map previews
- OpenStreetMap Nominatim for basic address lookup and destination search
- Google Maps deep links only when the user taps navigation buttons

No Google Maps Platform API key is required.

## Recommended Hosting

Netlify is a good fit because this is now a simple static Vite site.

GitHub Pages also works, but Netlify is usually easier for custom domains and deploy previews.

## Netlify

1. Import the GitHub repo into Netlify.
2. Use these build settings:
   - Build command: `npm run build`
   - Publish directory: `dist`
3. Deploy.

The included `netlify.toml` already contains those settings.

## Local Development

```bash
npm install
npm run dev
```

## Important Notes

Location access requires HTTPS in production. Netlify provides HTTPS automatically.

Google Maps is opened through normal web links such as:

```text
https://www.google.com/maps/dir/?api=1&destination=LAT,LNG&travelmode=walking
```

On phones and tablets, those links usually open the installed Google Maps app automatically. If the app is not installed, they open Google Maps in the browser.

OpenStreetMap Nominatim is fine for MVP and light usage. If this app becomes popular, consider adding a paid geocoding provider later.

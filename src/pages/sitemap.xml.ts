// Mapa do site para os motores de busca (https://solidlynx.pt/sitemap.xml).
import type { APIRoute } from "astro";
import { documentos } from "../data/empresa";

export const GET: APIRoute = ({ site }) => {
  const origem = (site ?? new URL("https://solidlynx.pt")).origin;
  const hoje = new Date().toISOString().slice(0, 10);
  const paginas = [
    { loc: "/", lastmod: hoje, priority: "1.0" },
    { loc: "/termos/", lastmod: documentos.termos.vigor, priority: "0.3" },
    { loc: "/privacidade/", lastmod: documentos.privacidade.vigor, priority: "0.3" },
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paginas.map(p => `  <url><loc>${origem}${p.loc}</loc><lastmod>${p.lastmod}</lastmod><priority>${p.priority}</priority></url>`).join("\n")}
</urlset>
`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
};

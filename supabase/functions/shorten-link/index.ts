const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();

    if (typeof url !== "string" || !/^https?:\/\//i.test(url)) {
      return new Response(JSON.stringify({ error: "URL inválida" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1) TinyURL (free, no key)
    try {
      const res = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`);
      const text = (await res.text()).trim();
      if (res.ok && /^https:\/\/tinyurl\.com\//.test(text)) {
        return new Response(JSON.stringify({ shortUrl: text }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } catch (_) {
      // fall through
    }

    // 2) is.gd fallback
    try {
      const res = await fetch(
        `https://is.gd/create.php?format=json&url=${encodeURIComponent(url)}`
      );
      const data = await res.json();
      if (data?.shorturl) {
        return new Response(JSON.stringify({ shortUrl: data.shorturl }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } catch (_) {
      // fall through
    }

    return new Response(JSON.stringify({ error: "Não foi possível encurtar o link" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("shorten-link error", err);
    return new Response(JSON.stringify({ error: "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

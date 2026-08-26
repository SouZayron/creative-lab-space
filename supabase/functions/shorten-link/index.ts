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

    const UA = { "User-Agent": "Mozilla/5.0 (compatible; LabXatBot/1.0)" };

    // 1) is.gd (free, no key, no ads, direct redirect)
    try {
      const res = await fetch(
        `https://is.gd/create.php?format=json&url=${encodeURIComponent(url)}`,
        { headers: UA }
      );
      const text = await res.text();
      const data = JSON.parse(text);
      if (data?.shorturl) {
        return new Response(JSON.stringify({ shortUrl: data.shorturl }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.log("is.gd failed", res.status, text);
    } catch (e) {
      console.log("is.gd error", String(e));
    }

    // 2) v.gd fallback (same provider, also ad-free)
    try {
      const res = await fetch(
        `https://v.gd/create.php?format=json&url=${encodeURIComponent(url)}`,
        { headers: UA }
      );
      const text = await res.text();
      const data = JSON.parse(text);
      if (data?.shorturl) {
        return new Response(JSON.stringify({ shortUrl: data.shorturl }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.log("v.gd failed", res.status, text);
    } catch (e) {
      console.log("v.gd error", String(e));
    }

    // 3) spoo.me fallback (free, no key, no ads)
    try {
      const res = await fetch("https://spoo.me/", {
        method: "POST",
        headers: { ...UA, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ url }).toString(),
      });
      const data = await res.json();
      if (data?.short_url) {
        return new Response(JSON.stringify({ shortUrl: data.short_url }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } catch (e) {
      console.log("spoo.me error", String(e));
    }


    // 3) TinyURL last resort
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

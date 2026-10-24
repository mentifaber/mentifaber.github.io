package org.mentifaber.store;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** Foundry's shelf, read from mentifaber.org/store/catalog.json. Installs are only ever made from what this class
 *  fetched itself: the page can ask for an app by its id, but the address and checksum always come from here. */
final class Catalog {
    static final String URL = "https://mentifaber.org/store/catalog.json";

    static final class App {
        final String id, name, apk, sha256, versionName;
        final long versionCode, size;

        App(JSONObject o) {
            id = o.optString("id"); name = o.optString("name", id); apk = o.optString("apk");
            sha256 = o.optString("sha256").toLowerCase(); versionName = o.optString("versionName");
            versionCode = o.optLong("versionCode"); size = o.optLong("size");
        }

        boolean ready() { return o(id) && apk.startsWith("https://") && sha256.matches("[0-9a-f]{64}") && versionCode > 0; }
        private static boolean o(String s) { return s != null && !s.isEmpty(); }
    }

    private static volatile List<App> last = Collections.emptyList();

    static List<App> fetch() throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(URL + "?t=" + System.currentTimeMillis() / 60000).openConnection();
        c.setConnectTimeout(15000); c.setReadTimeout(20000);
        c.setRequestProperty("accept", "application/json");
        try {
            if (c.getResponseCode() != 200) throw new IOException("the catalog answered " + c.getResponseCode());
            JSONArray a = new JSONObject(read(c.getInputStream())).getJSONArray("apps");
            List<App> out = new ArrayList<>();
            for (int i = 0; i < a.length(); i++) { App app = new App(a.getJSONObject(i)); if (app.ready()) out.add(app); }
            last = Collections.unmodifiableList(out);
            return last;
        } catch (org.json.JSONException e) {
            throw new IOException("the catalog couldn't be read", e);
        } finally { c.disconnect(); }
    }

    /** The app with this id, from a fresh copy of the catalog (or the last one, offline). */
    static App find(String id) {
        List<App> apps;
        try { apps = fetch(); } catch (IOException e) { apps = last; }
        for (App a : apps) if (a.id.equals(id)) return a;
        return null;
    }

    static List<App> cached() { return last; }

    private static String read(InputStream in) throws IOException {
        ByteArrayOutputStream b = new ByteArrayOutputStream(); byte[] buf = new byte[8192]; int n;
        try (InputStream s = in) { while ((n = s.read(buf)) > 0) { b.write(buf, 0, n); if (b.size() > 2_000_000) throw new IOException("the catalog is too big"); } }
        return new String(b.toByteArray(), StandardCharsets.UTF_8);
    }
}

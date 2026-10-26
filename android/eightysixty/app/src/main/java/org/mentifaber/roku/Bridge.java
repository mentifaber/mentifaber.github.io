package org.mentifaber.roku;

import android.content.Context;
import android.net.Uri;
import android.net.wifi.WifiManager;
import android.webkit.WebView;

import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebViewCompat;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.HttpURLConnection;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.MulticastSocket;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** The page's line to the TVs, as window.RokuBridge: given only to https://mentifaber.org, main frame only.
 *  Messages are JSON {op, req, …}: "discover" (an SSDP search, then each Roku's device-info), "info" {ip},
 *  "ecp" {ip, method, path} and "wake" {ip, mac} (a Wake-on-LAN magic packet, broadcast on this network). Answers come back as {req, ok, status, body} or {req, devices}. It talks to private
 *  network addresses on port 8060 alone, and only on Roku's control paths, so the page can't use it to reach anything else. */
final class Bridge implements WebViewCompat.WebMessageListener {
    private static final Pattern PATH = Pattern.compile("/(keypress|keydown|keyup|launch|input|search|query)(/[A-Za-z0-9_.%~-]*)*(\\?[A-Za-z0-9_.%=&~-]*)?");
    private static final Pattern LOCATION = Pattern.compile("(?im)^location:\\s*http://([0-9.]+):8060/?\\s*$");
    private final Context ctx;
    private final ExecutorService pool = Executors.newFixedThreadPool(3);
    private JavaScriptReplyProxy reply;

    Bridge(Context ctx) { this.ctx = ctx.getApplicationContext(); }

    @Override
    public void onPostMessage(WebView view, WebMessageCompat message, Uri origin, boolean isMainFrame, JavaScriptReplyProxy proxy) {
        if (!isMainFrame || !MainActivity.ORIGIN.equals(origin.toString())) return;
        reply = proxy;
        final JSONObject m;
        try { m = new JSONObject(message.getData() == null ? "" : message.getData()); } catch (JSONException e) { return; }
        final int req = m.optInt("req");
        pool.execute(() -> {
            JSONObject out;
            try {
                switch (m.optString("op")) {
                    case "discover": out = discover(); break;
                    case "info": out = ecp(m.optString("ip"), "GET", "/query/device-info"); break;
                    case "ecp": out = ecp(m.optString("ip"), m.optString("method", "GET"), m.optString("path")); break;
                    case "wake": out = wake(m.optString("ip"), m.optString("mac")); break;
                    default: out = fail("unknown request");
                }
            } catch (Exception e) { out = fail(e.getMessage() == null ? e.toString() : e.getMessage()); }
            try { out.put("req", req); } catch (JSONException ignored) { }
            send(out);
        });
    }

    /** SSDP: ask the Wi-Fi who answers to roku:ecp, for ~2.5 s, then read each one's device-info. */
    private JSONObject discover() throws Exception {
        WifiManager wifi = (WifiManager) ctx.getSystemService(Context.WIFI_SERVICE);
        WifiManager.MulticastLock lock = wifi == null ? null : wifi.createMulticastLock("eightysixty");
        Set<String> ips = new LinkedHashSet<>();
        if (lock != null) { lock.setReferenceCounted(false); lock.acquire(); }
        try (MulticastSocket sock = new MulticastSocket(null)) {
            sock.setReuseAddress(true);
            sock.bind(new InetSocketAddress(0));
            sock.setSoTimeout(400);
            byte[] q = ("M-SEARCH * HTTP/1.1\r\nHost: 239.255.255.250:1900\r\nMan: \"ssdp:discover\"\r\nST: roku:ecp\r\nMX: 2\r\n\r\n").getBytes(StandardCharsets.US_ASCII);
            InetAddress group = InetAddress.getByName("239.255.255.250");
            long end = System.currentTimeMillis() + 2600;
            int sent = 0;
            byte[] buf = new byte[2048];
            while (System.currentTimeMillis() < end) {
                if (sent < 3) { sock.send(new DatagramPacket(q, q.length, group, 1900)); sent++; }
                try {
                    DatagramPacket p = new DatagramPacket(buf, buf.length);
                    sock.receive(p);
                    Matcher l = LOCATION.matcher(new String(p.getData(), 0, p.getLength(), StandardCharsets.US_ASCII));
                    if (l.find() && local(l.group(1))) ips.add(l.group(1));
                } catch (SocketTimeoutException ignored) { }
            }
        } finally { if (lock != null) lock.release(); }
        JSONArray devs = new JSONArray();
        for (String ip : ips) {
            JSONObject i = ecp(ip, "GET", "/query/device-info");
            if (i.optInt("status") == 200) devs.put(new JSONObject().put("ip", ip).put("info", i.optString("body")));
        }
        return new JSONObject().put("ok", true).put("devices", devs);
    }

    /** Wake-on-LAN: six 0xFF bytes and the MAC sixteen times, to the network's broadcast addresses on ports 9 and 7, a few
     *  times over (Wi-Fi drops some). A Roku TV asleep with Fast TV Start keeps listening for this on its Wi-Fi. */
    private JSONObject wake(String ip, String mac) throws Exception {
        if (!local(ip)) return fail("only TVs on your own network");
        if (!mac.matches("([0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}")) return fail("no MAC address for this TV");
        byte[] p = new byte[102];
        for (int i = 0; i < 6; i++) p[i] = (byte) 0xFF;
        String[] h = mac.split("[:-]");
        for (int r = 0; r < 16; r++) for (int i = 0; i < 6; i++) p[6 + r * 6 + i] = (byte) Integer.parseInt(h[i], 16);
        String[] o = ip.split("\\.");
        InetAddress[] to = { InetAddress.getByName("255.255.255.255"), InetAddress.getByName(o[0] + "." + o[1] + "." + o[2] + ".255") };
        try (DatagramSocket sock = new DatagramSocket()) {
            sock.setBroadcast(true);
            for (int round = 0; round < 3; round++) {
                for (InetAddress a : to) for (int port : new int[]{9, 7}) {
                    try { sock.send(new DatagramPacket(p, p.length, a, port)); } catch (Exception ignored) { } // one address may be refused; the others still go
                }
                Thread.sleep(120);
            }
        }
        return new JSONObject().put("ok", true);
    }

    /** One External Control Protocol request to http://ip:8060/path. */
    private JSONObject ecp(String ip, String method, String path) throws Exception {
        if (!local(ip)) return fail("only TVs on your own network");
        if (!PATH.matcher(path).matches() || path.contains("..")) return fail("not a Roku control path");
        if (!"GET".equals(method) && !"POST".equals(method)) return fail("GET or POST only");
        HttpURLConnection c = (HttpURLConnection) new URL("http://" + ip + ":8060" + path).openConnection();
        try {
            c.setConnectTimeout(2500); c.setReadTimeout(3500); c.setInstanceFollowRedirects(false); c.setUseCaches(false);
            c.setRequestMethod(method);
            c.setRequestProperty("Connection", "close"); // Roku's little server answers one request per connection most reliably
            if ("POST".equals(method)) { c.setDoOutput(true); c.setFixedLengthStreamingMode(0); try (OutputStream o = c.getOutputStream()) { o.flush(); } }
            int code = c.getResponseCode();
            InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            if (path.startsWith("/query/icon/")) in = null; // an image: the page only needs to know whether it was allowed
            if (in != null) try (InputStream s = in) { byte[] k = new byte[8192]; int n; while ((n = s.read(k)) > 0 && b.size() < 512 * 1024) b.write(k, 0, n); }
            return new JSONObject().put("ok", code < 400).put("status", code).put("body", b.toString("UTF-8"));
        } finally { c.disconnect(); }
    }

    /** A private IPv4 address: 10/8, 172.16/12, 192.168/16, or link-local 169.254/16. */
    static boolean local(String ip) {
        if (ip == null || !ip.matches("\\d{1,3}(\\.\\d{1,3}){3}")) return false;
        try {
            InetAddress a = InetAddress.getByName(ip);
            return a instanceof Inet4Address && (a.isSiteLocalAddress() || a.isLinkLocalAddress());
        } catch (Exception e) { return false; }
    }

    private static JSONObject fail(String why) {
        try { return new JSONObject().put("ok", false).put("status", 0).put("error", why); } catch (JSONException e) { return new JSONObject(); }
    }

    private void send(JSONObject e) {
        JavaScriptReplyProxy r = reply;
        if (r == null) return;
        android.os.Handler h = new android.os.Handler(android.os.Looper.getMainLooper());
        h.post(() -> { try { r.postMessage(e.toString()); } catch (RuntimeException ignored) { } }); // the page went away
    }

    void close() { pool.shutdownNow(); }
}

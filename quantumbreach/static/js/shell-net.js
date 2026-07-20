// quantumbreach/static/js/shell-net.js
(function () {
  var S = window.PhantomShell; if (!S) return;
  var HOSTS = { alice: "10.0.0.11", bob: "10.0.0.12", eve: "10.0.0.66" };
  S.extend({
    ifconfig: function () { return "chan-q: inet 10.0.0.9  netmask 255.255.255.0  (quantum channel)\n  RX packets: photons  TX packets: photons"; },
    ip: function () { return S.registry.ifconfig(); },
    ping: function (p) { var h = p.args[0] || "channel-q"; var out = []; for (var i = 0; i < 3; i++) out.push("64 bytes from " + h + ": icmp_seq=" + (i + 1) + " time=" + (0.2 + i * 0.1).toFixed(1) + " ms"); return out.join("\n"); },
    nmap: function () { return "Starting nmap scan on channel-q...\n" + Object.keys(HOSTS).map(function (k) { return "Host " + k + " (" + HOSTS[k] + ")  up  role:" + k; }).join("\n") + "\n3 hosts up"; },
    netstat: function () { return "Proto  Local            Foreign          State\nqkd    10.0.0.9:qbit    10.0.0.12:qbit   ESTABLISHED"; },
    ssh: function (p) { var h = p.args[0] || ""; return HOSTS[h.replace(/^.*@/, "")] ? "ssh: connecting to " + h + "... permission denied (quantum handshake required)" : "ssh: could not resolve host " + h; }
  });
})();

# The Street Node

A box on a lamp post (game plan GP-9.1). In an outage, any phone nearby joins its Wi-Fi and gets the street's
[Street Board](https://mentifaber.org/street) and [Street Library](https://mentifaber.org/library) with no app and no
internet. When the box has a connection, it swaps the street's notices with mentifaber.org.

## What's here, and what's tested

- `street-node.mjs`: the box's server. It needs Node.js 20 or newer and nothing else.
  - **The apps:** it serves Street Board and Street Library, and answers `/api/board/<street>` and
    `/api/library/<street>` with the site's own code (`src/board.js`, `src/library.js`). The store is one JSON file
    (`--data`).
  - **Joining:** it answers the checks phones make when they join a network (`/generate_204`,
    `/hotspot-detect.html`, `/connecttest.txt` and the like), and any outside page, with the street's page. A phone
    that joins is shown the street straight away.
  - **Sealing:** sealing a photo needs the workshop, so on the box it's refused (503). Street Library then keeps the
    condition photo's fingerprint unsealed and says so.
  - **With a connection (`--upstream https://mentifaber.org`):** every `--sync` minutes (5 by default) it sends the
    box's notices to the site and brings the site's back. It also keeps the workshop's public seal key, so photos
    sealed earlier still check out offline.
- `mesh.mjs`: the box's radio. With a Meshtastic radio (`--mesh tcp://127.0.0.1:4403` for meshtasticd on the Pi with a
  LoRa board, or `--mesh /dev/ttyACM0` for one plugged in over USB):
  - **Out:** the street's new notices go out over the air, once each.
  - **In:** notices heard from radios and other boxes come onto the box's board, and aren't sent back out.
  - **The packets** are the ones Street Board's phones already send (`SB1|street|id|kind|at|exp|by|text`, one packet
    per notice), so a phone with a radio, another box and this box all read each other.
  - **Ignored:** another street's notices, and plain chat on the channel.
  - **Reconnecting:** if the radio goes away, the box connects again by itself.
- **Tested** by `tests/gtest/test74.mjs`, `tests/gtest/test75.mjs` and `tests/ui/node-ui.mjs`. Each runs the box as its
  own process:
  - test74 runs it beside a stand-in for the site;
  - test75 runs it with a stand-in radio speaking the Meshtastic TCP API;
  - node-ui runs it with two browser phones that can reach nothing but the box.

## Run it

```sh
node node/street-node.mjs --board elm-street --port 8080 --data /var/lib/street-node.json --upstream https://mentifaber.org \
  --mesh tcp://127.0.0.1:4403 --channel 0
```

The radio's protobuf messages are the ones the phones' radio code (`assets/ns/radio.js`) already uses with Meshtastic
radios. The box's bridge hasn't been tried with a real radio yet, only with the stand-in.

The board is the same one the street uses on the site: a name the street agrees on, or the 5-letter place code that
"Use where I am" gives on Street Board.

## The Wi-Fi (not yet tried on a Raspberry Pi)

This part isn't tested. These are the usual Raspberry Pi OS pieces, written down so a first box can be put together
and tried. Check them on real hardware before relying on them.

1. **The access point.** An open network with hostapd, named for the street (for example "Elm Street board"), on a
   fixed address such as `10.42.0.1`.
2. **DNS.** dnsmasq hands out addresses and answers every name with the box's address, so any page a phone asks for
   reaches it:
   ```
   interface=wlan0
   dhcp-range=10.42.0.10,10.42.0.250,12h
   address=/#/10.42.0.1
   ```
3. **The server.** Run the server on port 80, as a systemd service, so it starts with the box:
   ```
   [Service]
   ExecStart=/usr/bin/node /opt/mentifaber/node/street-node.mjs --board elm-street --port 80 --data /var/lib/street-node.json --upstream https://mentifaber.org
   Restart=always
   ```
4. **The internet, when there is any:** a second network interface (Ethernet, or a USB Wi-Fi or mobile dongle) for the
   upstream swap. Without one, the box is still the street's board. It just doesn't reach the site.

## Not yet

- **More than one street per box:** a box carries its own street's notices. The mesh itself carries packets on from
  radio to radio, so the next street's box hears them, but it keeps only its own street's.
- **Removals across the gap:** a notice taken down on the site isn't yet taken down on the box, or the other way
  round. Removals reach the phones on the same side.
- **Street Library stays on the box:** its shelf isn't swapped with the site, because only the lender's phone holds
  the key for a thing.
- **One connection, one daily limit:** the site counts the box as one connection, so a busy street could reach the
  site's daily limit for new notices (60) from the box. The rest go up the next day.

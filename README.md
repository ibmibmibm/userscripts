# userscripts

Userscripts by Shen-Ta Hsieh. Each script lives in `scripts/<name>/` and is built into `dist/<name>.user.js`.

| Script | Install | About |
|---|---|---|
| MINC ISRC to MusicBrainz | [dist/minc-isrc-to-musicbrainz.user.js](https://github.com/ibmibmibm/userscripts/raw/main/dist/minc-isrc-to-musicbrainz.user.js) | [scripts/minc-isrc-to-musicbrainz](scripts/minc-isrc-to-musicbrainz/README.md) |

## Develop

    npm install
    npm run typecheck
    npm test
    npm run build            # every script
    node build.mjs <name>    # one script

`dist/` is committed. The GitHub Actions workflow rebuilds it on every push to `main` and commits the result.
To add a script, create `scripts/<name>/header.txt` and `scripts/<name>/src/main.ts`; the build picks it up.

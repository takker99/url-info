import {ServerRequest} from "https://deno.land/std/http/server.ts";
import {DOMParser} from "https://deno.land/x/deno_dom/deno-dom-wasm.ts";
import iconvLite from 'https://cdn.skypack.dev/iconv-lite';
import {Buffer} from 'https://deno.land/std@0.84.0/node/buffer.ts';


interface URLInfoResponse {
    url: string;
    title?: string;
    fragment?: {
        hash: string;
        content?: string;
    };
    ogps?: {
        property?: string;
        content?: string;
    }[];
}

export default async (req: ServerRequest) => {
    // 引数を受け取る
    const base = `${req.headers.get("x-forwarded-proto")}://${req.headers.get(
        "x-forwarded-host"
    )}`;
    const url = new URL(req.url, base);
    const params = url.searchParams;
    const targetURL = params.get("url");
    const hash = params.get("hash") ?? undefined;

    if (!targetURL) {
        respondJSON({error: "No URL was found."}, req);
        return;
    }
    // jsonにして返す
    let result: URLInfoResponse = {url: targetURL};

    // html textをfetchする
    console.log(`Fetching HTML from ${targetURL}...`);
    try {
        const res = await fetch(targetURL);
        console.log("Success! response: %o", res);
        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, "text/html");
        // 文字コードを取得する
        let encode = 'UTF-8';
        const contentType = res.headers.get('content-type') ?? '';
        const contentType2 = doc?.querySelector('meta[http-equiv="content-type"]')?.getAttribute('content') ?? '';
        if (/^.*charset=\w+/.test(contentType)) {
            // まずContent-Typeからの取得を試みる
            encode = contentType.replace(/^.*charset=(\w+)/, '$1');
        } else if (/^.*charset=\w+/.test(contentType2)) {
            // なかったら<meta> tagから取得する
            encode = contentType2.replace(/^.*charset=(\w+)/, '$1');
        }
        if (encode === 'shift_jis') encode = 'shift-jis';
        // 特定できなかったら、UTF-8ということにする
        // encodeを指定して読み直す
        console.log(`Parsing HTML text as ${encode}...`);

        const encodedHTML = iconvLite.decode(Buffer.from(html), encode);
        const document = new DOMParser().parseFromString(encodedHTML, "text/html");
        console.log('Finish encoding!');
        // titleを取得する
        result.title = document?.getElementsByTagName("title")?.[0]?.textContent;

        // URL fragmentに対応する要素の中身を取得する
        if (hash) {
            result.fragment = {
                hash: `#${hash}`,
                content:
                    document?.getElementById(hash)?.textContent ??
                    //なかったらname属性を探す
                    document?.querySelector(`[name="${hash}"]`)?.textContent,
            };
        }

        // OGPを取得する
        result.ogps = document?.getElementsByTagName("meta").map((meta) => {
            return {
                property:
                    meta.getAttribute("name") ??
                    meta.getAttribute("property") ??
                    undefined,
                content: meta.getAttribute("content") ?? undefined,
            };
        });

        console.log("Return this json: %o", result);
        respondJSON(result, req);
    } catch (e) {
        console.error(e);
    }
};

function respondJSON<T extends {}>(json: T, req: ServerRequest) {
    const headers = new Headers();
    headers.set("Content-Type", "application/json; charset=utf8");
    req.respond({
        headers,
        body: JSON.stringify(json, null, 2),
    });
}

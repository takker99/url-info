import { ServerRequest } from "https://deno.land/std/http/server.ts";
import { DOMParser } from "https://deno.land/x/deno_dom/deno-dom-wasm.ts";

interface URLInfoResponse {
  url: string;
  title?: string;
  fragment?: {
    hash: string;
    content?: string;
  };
  ogps?: {
    [key: string]: string;
  }[];
  encoding: string;
}

export default async (req: ServerRequest) => {
  // 引数を受け取る
  const base = `${req.headers.get("x-forwarded-proto")}://${
    req.headers.get(
      "x-forwarded-host",
    )
  }`;
  const url = new URL(req.url, base);
  const params = url.searchParams;
  const targetURL = params.get("url");
  const hash = params.get("hash") ?? undefined;

  if (!targetURL) {
    respondJSON({ error: "No URL was found." }, req);
    return;
  }
  // jsonにして返す
  let result: URLInfoResponse = { url: targetURL, encoding: "utf-8" };

  // html textをfetchする
  console.log(`Fetching HTML from ${targetURL}...`);
  try {
    const res = await fetch(targetURL);
    console.log("Success! response: ", res);
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    // titleを取得する
    result.title = doc?.getElementsByTagName("title")?.[0]?.textContent;

    // URL fragmentに対応する要素の中身を取得する
    if (hash) {
      result.fragment = {
        hash: `#${hash}`,
        content: doc?.getElementById(hash)?.textContent ??
          //なかったらname属性を探す
          doc?.querySelector(`[name="${hash}"]`)?.textContent,
      };
    }

    // OGPを取得する
    result.ogps = doc?.getElementsByTagName("meta").map((meta) => {
      let result: { [key: string]: string } = {};
      for (const [name, value] of Object.entries(meta.attributes)) {
        result[name] = value;
      }
      return result;
    });

    // encode情報を取得する
    result.encoding = result.ogps?.find((attr) =>
      attr["charset"] !== undefined
    )?.["charset"] ??
      result.ogps?.find((attr) => attr["http-equiv"] === "content-type")
        ?.["content"].split(";").find((text) => /charset=\w+$/.test(text))
        ?.replace(/charset=(\w+)$/, "$1") ??
      "utf-8";

    console.log("Return this json: %o", result);
    respondJSON(result, req);
  } catch (e) {
    console.error(e);
  }
};

function respondJSON<T extends {}>(json: T, req: ServerRequest) {
  const headers = new Headers();
  headers.set("Content-Type", "application/json; charset=utf-8");
  req.respond({
    headers,
    body: JSON.stringify(json, null, 2),
  });
}

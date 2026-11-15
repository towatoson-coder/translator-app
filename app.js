import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2";

const $ = (id) => document.getElementById(id);
const statusEl = $("status");
const progressBar = $("progressBar");
const modelInfo = $("modelInfo");
const outputEl = $("outputText");

const MODEL_ID = "Xenova/nllb-200-distilled-600M";
let translator = null;
let loadingPromise = null;
let modelReady = false;

env.useBrowserCache = true;
env.allowLocalModels = false;
// Prefer broad iPhone compatibility over WebGPU; inference runs locally through WASM.
env.backends.onnx.wasm.numThreads = 1;

function setStatus(message) { statusEl.textContent = message; }

async function loadModel() {
  if (translator) return translator;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    setStatus("翻訳モデルをダウンロード・読み込み中です。画面を閉じずにお待ちください。");
    modelInfo.textContent = "モデルを準備しています。初回はダウンロードに時間がかかる場合があります。";
    try {
      translator = await pipeline("translation", MODEL_ID, {
        dtype: "q8",
        device: "wasm",
        progress_callback: (event) => {
          if (event.status === "progress" && Number.isFinite(event.progress)) {
            const pct = Math.max(0, Math.min(100, event.progress));
            progressBar.style.width = `${pct}%`;
            modelInfo.textContent = `モデルをダウンロード中：${Math.round(pct)}%`;
          } else if (event.status === "done") {
            progressBar.style.width = "100%";
          } else if (event.status === "initiate") {
            modelInfo.textContent = `準備中：${event.file || "モデルファイル"}`;
          }
        }
      });
      modelReady = true;
      setStatus("準備完了。モデルが端末のブラウザキャッシュに保存されました。");
      modelInfo.textContent = "準備完了。次回以降はキャッシュ済みファイルを使って翻訳できます。SafariのWebサイトデータを消去すると再ダウンロードが必要です。";
      $("download").textContent = "準備完了";
      $("download").disabled = true;
      return translator;
    } catch (err) {
      translator = null;
      setStatus("読み込みに失敗しました。通信環境・空き容量を確認して再試行してください。");
      modelInfo.textContent = `エラー：${err?.message || err}`;
      throw err;
    } finally {
      loadingPromise = null;
    }
  })();
  return loadingPromise;
}

$("download").addEventListener("click", async () => {
  try { await loadModel(); }
  catch (e) { console.error(e); }
});

$("translate").addEventListener("click", async () => {
  const text = $("inputText").value.trim();
  if (!text) {
    outputEl.textContent = "翻訳する文章を入力してください。";
    return;
  }
  const src = $("source").value;
  const tgt = $("target").value;
  if (src === tgt) {
    outputEl.textContent = text;
    $("copy").disabled = false;
    return;
  }
  $("translate").disabled = true;
  $("translate").textContent = "翻訳中…";
  try {
    const model = await loadModel();
    setStatus("翻訳中…（文章は端末内で処理されています）");
    const result = await model(text, { src_lang: src, tgt_lang: tgt });
    outputEl.textContent = result?.[0]?.translation_text || "翻訳結果を取得できませんでした。";
    $("copy").disabled = !result?.[0]?.translation_text;
    setStatus("翻訳完了");
  } catch (err) {
    outputEl.textContent = `翻訳に失敗しました。\n${err?.message || err}`;
    console.error(err);
  } finally {
    $("translate").disabled = false;
    $("translate").textContent = "翻訳する";
  }
});

$("swap").addEventListener("click", () => {
  const src = $("source"), tgt = $("target");
  const old = src.value;
  src.value = tgt.value;
  tgt.value = old;
});
$("clear").addEventListener("click", () => {
  $("inputText").value = "";
  outputEl.textContent = "翻訳結果がここに表示されます。";
  $("copy").disabled = true;
});
$("copy").addEventListener("click", async () => {
  const text = outputEl.textContent;
  try {
    await navigator.clipboard.writeText(text);
    $("copy").textContent = "コピー済み";
    setTimeout(() => $("copy").textContent = "コピー", 1400);
  } catch {
    setStatus("コピーできませんでした。結果を長押ししてコピーしてください。");
  }
});

// Register the app-shell service worker. Model files are cached by Transformers.js.
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(console.warn));
}

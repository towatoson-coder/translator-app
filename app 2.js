import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2";

const $ = (id) => document.getElementById(id);
const statusEl = $("status"), progressBar = $("progressBar"), modelInfo = $("modelInfo"), outputEl = $("outputText");
const MODEL_ID = "casawolice/small100-onnx";
let translator = null, loadingPromise = null;

env.useBrowserCache = true;
env.allowLocalModels = false;
env.backends.onnx.wasm.numThreads = 1;

function setStatus(message) { statusEl.textContent = message; }

function onProgress(event) {
  if (event.status === "progress" && Number.isFinite(event.progress)) {
    const percent = Math.max(0, Math.min(100, event.progress));
    progressBar.style.width = `${percent}%`;
    modelInfo.textContent = `モデルファイルを取得中：${Math.round(percent)}%`;
  } else if (event.status === "initiate") {
    modelInfo.textContent = `取得準備中：${event.file || "モデルファイル"}`;
  } else if (event.status === "done") {
    modelInfo.textContent = "ファイル取得完了。翻訳エンジンを準備しています…";
  }
}

async function loadModel() {
  if (translator) return translator;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const button = $("download");
    button.disabled = true;
    progressBar.style.width = "0%";
    setStatus("翻訳モデルを準備しています。Safariを閉じずにお待ちください。");
    modelInfo.textContent = "初回は約609MBのモデルを取得します。Wi-Fi接続を維持してください。";

    try {
      translator = await pipeline("translation", MODEL_ID, {
        device: "wasm",
        dtype: "q8",
        progress_callback: onProgress
      });
      progressBar.style.width = "100%";
      setStatus("モデルの読み込み完了。翻訳できます。");
      modelInfo.textContent = "モデル準備完了。通信を切ってからの翻訳は実機で確認してください。";
      button.textContent = "準備完了";
      return translator;
    } catch (error) {
      translator = null;
      setStatus("モデルの準備に失敗しました。");
      modelInfo.textContent = `エラー：${error?.message || error}`;
      throw error;
    } finally {
      button.disabled = false;
      loadingPromise = null;
    }
  })();
  return loadingPromise;
}

async function translateText(text, source, target) {
  const pipe = await loadModel();
  const result = await pipe(text, {
    src_lang: source, tgt_lang: target, num_beams: 1, max_new_tokens: 128
  });
  return Array.isArray(result) ? (result[0]?.translation_text || "") : "";
}

$("download").addEventListener("click", async () => {
  try { await loadModel(); } catch (error) { console.error(error); }
});

$("translate").addEventListener("click", async () => {
  const text = $("inputText").value.trim();
  if (!text) { outputEl.textContent = "翻訳する文章を入力してください。"; return; }
  const source = $("source").value, target = $("target").value;
  if (source === target) {
    outputEl.textContent = text; $("copy").disabled = false; return;
  }
  const button = $("translate");
  button.disabled = true; button.textContent = "翻訳中…";
  try {
    setStatus("翻訳中…（端末内で処理しています）");
    const result = await translateText(text, source, target);
    outputEl.textContent = result || "翻訳結果を取得できませんでした。";
    $("copy").disabled = !result;
    setStatus(result ? "翻訳完了" : "翻訳結果がありません");
  } catch (error) {
    outputEl.textContent = `翻訳に失敗しました。\\n${error?.message || error}`;
    console.error(error); setStatus("翻訳に失敗しました。");
  } finally {
    button.disabled = false; button.textContent = "翻訳する";
  }
});

$("swap").addEventListener("click", () => {
  const source = $("source"), target = $("target"), value = source.value;
  source.value = target.value; target.value = value;
});
$("clear").addEventListener("click", () => {
  $("inputText").value = "";
  outputEl.textContent = "翻訳結果がここに表示されます。";
  $("copy").disabled = true;
});
$("copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(outputEl.textContent);
    $("copy").textContent = "コピー済み";
    setTimeout(() => { $("copy").textContent = "コピー"; }, 1400);
  } catch {
    setStatus("コピーできませんでした。結果を長押ししてコピーしてください。");
  }
});
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(console.warn));
}

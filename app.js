import { AutoTokenizer, AutoModelForSeq2SeqLM, Tensor, env } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2";

const $ = (id) => document.getElementById(id);
const statusEl = $("status"), progressBar = $("progressBar"), modelInfo = $("modelInfo"), outputEl = $("outputText");
const MODEL_ID = "casawolice/small100-onnx";
const LANG_TO_ID = { en: 128022, ja: 128046, mn: 128062 };
let tokenizer = null, model = null, loadingPromise = null;

env.useBrowserCache = true;
env.allowLocalModels = false;
env.backends.onnx.wasm.numThreads = 1;
function setStatus(s) { statusEl.textContent = s; }
function onProgress(e) {
  if (e.status === "progress" && Number.isFinite(e.progress)) {
    const p = Math.max(0, Math.min(100, e.progress));
    progressBar.style.width = `${p}%`;
    modelInfo.textContent = `モデルファイルを取得中：${Math.round(p)}%`;
  } else if (e.status === "initiate") modelInfo.textContent = `取得準備中：${e.file || "モデルファイル"}`;
}
async function loadModel() {
  if (model && tokenizer) return;
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    $("download").disabled = true;
    setStatus("翻訳モデルを準備しています。Safariを閉じずにお待ちください。");
    modelInfo.textContent = "軽量モデル（約609MB）の初回取得中です。Wi-Fi接続を維持してください。";
    try {
      tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID, { progress_callback: onProgress });
      model = await AutoModelForSeq2SeqLM.from_pretrained(MODEL_ID, {
        device: "wasm", progress_callback: onProgress
      });
      progressBar.style.width = "100%";
      setStatus("モデルの読み込み完了。オンラインで翻訳テストをしてください。");
      modelInfo.textContent = "モデル読み込み完了。Safariのサイトデータ削除やキャッシュ消去で再取得が必要になる場合があります。";
      $("download").textContent = "準備完了";
    } catch (e) {
      tokenizer = null; model = null;
      setStatus("モデルの準備に失敗しました。通信環境・空き容量を確認してください。");
      modelInfo.textContent = `エラー：${e?.message || e}`;
      throw e;
    } finally { $("download").disabled = false; loadingPromise = null; }
  })();
  return loadingPromise;
}
async function translateText(text, target) {
  await loadModel();
  const enc = await tokenizer(text);
  const srcIds = Array.from(enc.input_ids.data, Number);
  const ids = [LANG_TO_ID[target], ...srcIds];
  const input_ids = new Tensor("int64", BigInt64Array.from(ids.map(BigInt)), [1, ids.length]);
  const attention_mask = new Tensor("int64", BigInt64Array.from(ids.map(() => 1n)), [1, ids.length]);
  const out = await model.generate({ input_ids, attention_mask, max_new_tokens: 128, num_beams: 1 });
  return tokenizer.decode(Array.from(out[0].data, Number), { skip_special_tokens: true });
}
$("download").addEventListener("click", async () => { try { await loadModel(); } catch (e) { console.error(e); } });
$("translate").addEventListener("click", async () => {
  const text = $("inputText").value.trim();
  if (!text) { outputEl.textContent = "翻訳する文章を入力してください。"; return; }
  const src = $("source").value, tgt = $("target").value;
  if (src === tgt) { outputEl.textContent = text; $("copy").disabled = false; return; }
  $("translate").disabled = true; $("translate").textContent = "翻訳中…";
  try {
    setStatus("翻訳中…（端末内で処理しています）");
    const result = await translateText(text, tgt);
    outputEl.textContent = result || "翻訳結果を取得できませんでした。";
    $("copy").disabled = !result; setStatus("翻訳完了");
  } catch (e) { outputEl.textContent = `翻訳に失敗しました。\n${e?.message || e}`; console.error(e); }
  finally { $("translate").disabled = false; $("translate").textContent = "翻訳する"; }
});
$("swap").addEventListener("click", () => { const a = $("source"), b = $("target"), v = a.value; a.value = b.value; b.value = v; });
$("clear").addEventListener("click", () => { $("inputText").value = ""; outputEl.textContent = "翻訳結果がここに表示されます。"; $("copy").disabled = true; });
$("copy").addEventListener("click", async () => { try { await navigator.clipboard.writeText(outputEl.textContent); $("copy").textContent = "コピー済み"; setTimeout(() => $("copy").textContent = "コピー", 1400); } catch { setStatus("コピーできませんでした。結果を長押ししてコピーしてください。"); } });
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(console.warn));

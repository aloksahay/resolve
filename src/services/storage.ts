import { ZgFile, Indexer } from "@0glabs/0g-ts-sdk";
import { config } from "../config";
import { wallet } from "./chain";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const indexer = new Indexer(config.storageIndexer);

export async function uploadJson(data: object): Promise<string> {
  const json = JSON.stringify(data, null, 2);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "0g-storage-"));
  const tmpFile = path.join(tmpDir, "data.json");

  try {
    fs.writeFileSync(tmpFile, json);

    const zgFile = await ZgFile.fromFilePath(tmpFile);
    const [tree, err] = await zgFile.merkleTree();
    if (err || !tree) {
      throw new Error(`Failed to build merkle tree: ${err}`);
    }
    const rootHash = tree.rootHash() as string;

    const [txHash, uploadErr] = await indexer.upload(
      zgFile,
      config.storageRpc,
      wallet
    );
    if (uploadErr) {
      throw new Error(`Upload failed: ${uploadErr}`);
    }

    await zgFile.close();
    return rootHash;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

export async function downloadJson<T = any>(rootHash: string): Promise<T> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "0g-download-"));
  const tmpFile = path.join(tmpDir, "data.json");

  try {
    const downloadErr = await indexer.download(rootHash, tmpFile, true);
    if (downloadErr) {
      throw new Error(`Download failed: ${downloadErr}`);
    }
    const content = fs.readFileSync(tmpFile, "utf-8");
    return JSON.parse(content) as T;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

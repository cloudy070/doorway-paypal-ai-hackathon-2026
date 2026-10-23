import { spawnSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
  assertHumanApproval,
  isolatedRecoveryConfig,
  recordRecoveryResult,
} from "../src/lib/recovery-harness";

const configuredKey = generateKeyPairSync("ed25519")
  .privateKey.export({ type: "pkcs8", format: "pem" })
  .toString();
const configured = {
  ISOLATED_SANDBOX: "1",
  TEST_DATABASE_URL:
    "postgresql://fixture:fixture@127.0.0.1/doorway_recovery_tests",
  DATABASE_URL: "postgresql://fixture:fixture@127.0.0.1/doorway",
  PAYPAL_CLIENT_ID: "fixture",
  PAYPAL_CLIENT_SECRET: "fixture",
  PAYPAL_MERCHANT_ID: "FIXTURE-PAYEE",
  RECEIPT_PRIVATE_KEY: configuredKey,
};

describe("isolated recovery CLI safeguards", () => {
  it("refuses missing isolation, missing services and the primary database before any provider call", () => {
    expect(isolatedRecoveryConfig(configured).signer.publicKey).toContain(
      "PUBLIC KEY",
    );
    expect(() =>
      isolatedRecoveryConfig({ ...configured, ISOLATED_SANDBOX: "0" }),
    ).toThrow("ISOLATED_SANDBOX_REQUIRED");
    expect(() =>
      isolatedRecoveryConfig({ ...configured, TEST_DATABASE_URL: undefined }),
    ).toThrow("TEST_DATABASE_URL_REQUIRED");
    expect(() =>
      isolatedRecoveryConfig({ ...configured, PAYPAL_CLIENT_SECRET: "" }),
    ).toThrow("PAYPAL_SANDBOX_NOT_CONFIGURED");
    expect(() =>
      isolatedRecoveryConfig({
        ...configured,
        DATABASE_URL: configured.TEST_DATABASE_URL.replace(
          "fixture:fixture",
          "other:other",
        ),
      }),
    ).toThrow("PRIMARY_DATABASE_FORBIDDEN");
    expect(() =>
      isolatedRecoveryConfig({
        ...configured,
        TEST_DATABASE_URL: "postgresql://fixture:fixture@127.0.0.1/doorway",
      }),
    ).toThrow("EXPLICIT_TEST_DATABASE_NAME_REQUIRED");
    expect(() =>
      isolatedRecoveryConfig({ ...configured, RECEIPT_PRIVATE_KEY: "" }),
    ).toThrow("STABLE_RECEIPT_KEY_REQUIRED");
    expect(() =>
      isolatedRecoveryConfig({
        ...configured,
        TEST_DATABASE_URL:
          configured.TEST_DATABASE_URL + "?host=primary.example",
      }),
    ).toThrow("DATABASE_CONNECTION_OVERRIDE_FORBIDDEN");
    expect(() =>
      isolatedRecoveryConfig({
        ...configured,
        DATABASE_URL: "postgresql://primary/doorway_recovery_tests",
      }),
    ).toThrow("PRIMARY_DATABASE_FORBIDDEN");
    expect(() =>
      isolatedRecoveryConfig({
        ...configured,
        DATABASE_URL: configured.TEST_DATABASE_URL.replace(
          "127.0.0.1",
          "localhost",
        ),
      }),
    ).toThrow("PRIMARY_DATABASE_FORBIDDEN");
    expect(() =>
      isolatedRecoveryConfig({
        ...configured,
        RECEIPT_PRIVATE_KEY: "nonempty-invalid-pem",
      }),
    ).toThrow("VALID_ED25519_RECEIPT_KEY_REQUIRED");
    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 })
      .privateKey.export({ type: "pkcs8", format: "pem" })
      .toString();
    expect(() =>
      isolatedRecoveryConfig({ ...configured, RECEIPT_PRIVATE_KEY: rsa }),
    ).toThrow("VALID_ED25519_RECEIPT_KEY_REQUIRED");
  });
  it("does not invent human consent from an order or another order's attestation", () => {
    expect(() => assertHumanApproval(undefined, "ORDER1")).toThrow(
      "EXISTING_HUMAN_APPROVAL",
    );
    expect(() =>
      assertHumanApproval(
        {
          actor_kind: "AGENT",
          role: "sandbox_buyer",
          order_id: "ORDER1",
          confirmed: true,
          recorded_at: new Date().toISOString(),
        },
        "ORDER1",
      ),
    ).toThrow("ATTESTATION_MISMATCH");
    expect(() =>
      assertHumanApproval(
        {
          actor_kind: "HUMAN",
          role: "sandbox_buyer",
          order_id: "OTHER",
          confirmed: true,
          recorded_at: new Date().toISOString(),
        },
        "ORDER1",
      ),
    ).toThrow("ATTESTATION_MISMATCH");
  });
  it("the actual CLI refuses absent keys with an explicit503 result before opening a database", () => {
    const result = spawnSync(
      process.execPath,
      [
        path.resolve("node_modules/tsx/dist/cli.mjs"),
        path.resolve("scripts/live-recovery.ts"),
        "--checkout",
        "not-used",
        "--approval-attestation",
        "not-read.json",
      ],
      {
        env: {
          ...process.env,
          ISOLATED_SANDBOX: "1",
          TEST_DATABASE_URL:
            "postgresql://fixture:fixture@127.0.0.1:1/isolated_recovery_tests",
          DATABASE_URL: "",
          PAYPAL_CLIENT_ID: "",
          PAYPAL_CLIENT_SECRET: "",
          PAYPAL_MERCHANT_ID: "",
          RECEIPT_PRIVATE_KEY: "",
        },
        encoding: "utf8",
        timeout: 10000,
        windowsHide: true,
      },
    );
    expect(result.status, result.stderr).toBe(1);
    expect(JSON.parse(result.stderr.trim())).toMatchObject({
      code: "PAYPAL_SANDBOX_NOT_CONFIGURED",
      http_status: 503,
      external_provider_proven: false,
    });
  });
});

it("LOCAL_VALIDATION: child exits86 after injected capture; read outage preserves UNKNOWN and fresh process resumes once", () => {
  const workspace = process.cwd(),
    root = path.resolve(workspace, "work", "recovery-tests");
  mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(path.join(root, "process-")),
    runner = path.join(directory, "runner.mts");
  const source = (file: string) =>
    JSON.stringify(pathToFileURL(path.join(workspace, file)).href);
  const privateKey = generateKeyPairSync("ed25519")
    .privateKey.export({ type: "pkcs8", format: "pem" })
    .toString();
  const code = `
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import path from 'node:path';
const {createStore}=await import(${source("src/lib/db.ts")});
const {createQuote}=await import(${source("src/lib/commerce.ts")});
const {PaymentService}=await import(${source("src/lib/payments.ts")});
const {SandboxPayPal}=await import(${source("src/lib/paypal.ts")});
const {ReceiptSigner}=await import(${source("src/lib/receipts.ts")});
const {captureAndCrash,recoverAfterCaptureCrash,writeRecoveryMarker}=await import(${source("src/lib/recovery-harness.ts")});
const dir=process.env.RECOVERY_TEST_DIR;
const stateFile=path.join(dir,'injected-provider.json'), markerFile=path.join(dir,'marker.json'), checkoutFile=path.join(dir,'checkout.json');
const read=()=>JSON.parse(readFileSync(stateFile,'utf8'));
const save=value=>writeFileSync(stateFile,JSON.stringify(value));
if(!existsSync(stateFile))save({createCalls:0,captureCalls:0});
let recoveryOrderReads=0;
const transport=async(input,init)=>{
 const url=new URL(String(input));if(url.origin!=='https://api-m.sandbox.paypal.com')throw new Error('UNEXPECTED_PROVIDER_ORIGIN');
 const result=value=>new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});
 if(url.pathname==='/v1/oauth2/token')return result({access_token:'test-only-access',expires_in:3600});
 const state=read();
 if(url.pathname==='/v2/checkout/orders'&&init.method==='POST'){
   if(++state.createCalls!==1)throw new Error('DUPLICATE_CREATE');
   const body=JSON.parse(init.body);state.order={id:'ORDER1',intent:'CAPTURE',status:'CREATED',purchase_units:body.purchase_units,links:[{rel:'payer-action',href:'https://www.sandbox.paypal.com/checkoutnow?token=ORDER1'}]};save(state);return result(state.order);
 }
 if(url.pathname==='/v2/checkout/orders/ORDER1'&&init.method==='GET'){if(process.argv[2]==='recover-unavailable'||process.argv[2]==='recover-final-read-unavailable'&&++recoveryOrderReads===2)throw new Error('INJECTED_PROVIDER_READ_OUTAGE');return result(state.order);}
 if(url.pathname==='/v2/checkout/orders/ORDER1/capture'&&init.method==='POST'){
   if(++state.captureCalls!==1)throw new Error('DUPLICATE_CAPTURE');
   state.capture={id:'CAPTURE1',status:'COMPLETED',amount:state.order.purchase_units[0].amount,final_capture:true,supplementary_data:{related_ids:{order_id:'ORDER1'}}};state.order.status='COMPLETED';state.order.purchase_units[0].payments={captures:[state.capture]};save(state);return result(state.order);
 }
 if(url.pathname==='/v2/payments/captures/CAPTURE1'&&init.method==='GET')return result(state.capture);
 throw new Error('UNEXPECTED_HTTP_OPERATION');
};
const gateway=new SandboxPayPal({clientId:'fixture',clientSecret:'fixture',webhookId:'fixture',returnUrl:'http://127.0.0.1:3000/return',cancelUrl:'http://127.0.0.1:3000/cancel',fetch:transport});
const signer=new ReceiptSigner(process.env.RECEIPT_PRIVATE_KEY);
const store=await createStore();
try{
 const stage=process.argv[2];
 if(stage==='seed'){
   const now=new Date().toISOString();
   const shop={id:'shop1',ownerId:'owner1',slug:'fixture',name:'Fixture',siteUrl:'https://example.com',currency:'GBP',paypalMerchantId:'FIXTURE-PAYEE',ownershipToken:'fixture',domainVerified:true,publishedVersion:1,createdAt:now};
   const catalog={id:'catalog1',shopId:'shop1',version:1,status:'APPROVED',approvedAt:now,createdAt:now,source:'SYNTHETIC',sources:[],warnings:[],products:[{id:'bread',name:'Bread',description:'Fixture',priceMinor:500,currency:'GBP',stock:3,attributes:{}}],rules:{pickupDays:[0,1,2,3,4,5,6],leadTimeHours:0,minOrderMinor:0,maxQuantityPerLine:10,deliveryPolicy:'Pickup only',returnsPolicy:'Contact owner'}};
   await store.set('shops',shop.id,shop);await store.set('catalogs',catalog.id,catalog);
   const quote=await createQuote(store,shop.id,[{productId:'bread',quantity:2}],{pickupDate:new Date(Date.now()+86400000).toISOString().slice(0,10)});
   const checkout=await new PaymentService(store,gateway,{receiptSigner:signer}).startCheckout(shop.id,quote.id);
   const state=read();state.order.status='APPROVED';save(state);writeFileSync(checkoutFile,JSON.stringify({id:checkout.id}));
   console.log(JSON.stringify({source:'LOCAL_VALIDATION',stage:'SEEDED'}));
 }else{
   const {id}=JSON.parse(readFileSync(checkoutFile,'utf8'));
   if(stage==='crash'||stage==='unapproved'){
     // Only this injected test fixture changes simulated provider approval.
     const state=read();state.order.status=stage==='crash'?'APPROVED':'CREATED';save(state);
     // Artificial test attestation only: never exported as a human result.
     const approval={actor_kind:'HUMAN',role:'sandbox_buyer',order_id:'ORDER1',confirmed:true,recorded_at:new Date().toISOString(),synthetic_test_fixture:true};
     await captureAndCrash(store,gateway,{checkoutId:id,merchantId:'FIXTURE-PAYEE',runId:'test-process-boundary',source:'LOCAL_VALIDATION',approval,signer,writeMarker:marker=>writeRecoveryMarker(markerFile,marker),terminate:code=>process.exit(code)});
   }else if(['recover','recover-unavailable','recover-final-read-unavailable'].includes(stage)){
     const marker=JSON.parse(readFileSync(markerFile,'utf8'));
     let result;try{result=await recoverAfterCaptureCrash(store,gateway,id,marker,signer);}catch(error){const current=await store.get('checkouts',id),op=await store.get('operations',id+':capture'),receipts=await store.list('receipts');console.log(JSON.stringify({source:'LOCAL_VALIDATION',status:current.status,operation_status:op.status,receipt_count:receipts.length,provider_capture_calls:read().captureCalls}));throw error;}
     const state=read();console.log(JSON.stringify({...result,provider_create_calls:state.createCalls,provider_capture_calls:state.captureCalls}));
   }
 }
}finally{await store.close();}
`;
  writeFileSync(runner, code);
  const child = (stage: string) =>
    spawnSync(
      process.execPath,
      [path.join(workspace, "node_modules/tsx/dist/cli.mjs"), runner, stage],
      {
        cwd: workspace,
        env: {
          ...process.env,
          DATA_DIR: path.join(directory, "sql"),
          TEST_DB_MEMORY: "0",
          RECOVERY_TEST_DIR: directory,
          RECEIPT_PRIVATE_KEY: privateKey,
        },
        encoding: "utf8",
        timeout: 20000,
        windowsHide: true,
      },
    );
  try {
    const seeded = child("seed");
    expect(seeded.status, seeded.stderr).toBe(0);
    const unapproved = child("unapproved");
    expect(unapproved.status).toBe(1);
    expect(unapproved.stderr).toContain(
      "AUTHENTICATED_APPROVED_UNCAPTURED_ORDER_REQUIRED",
    );
    expect(
      JSON.parse(
        readFileSync(path.join(directory, "injected-provider.json"), "utf8"),
      ).captureCalls,
    ).toBe(0);
    expect(existsSync(path.join(directory, "marker.json"))).toBe(false);
    const crashed = child("crash");
    expect(crashed.status, crashed.stderr).toBe(86);
    const markerText = readFileSync(
      path.join(directory, "marker.json"),
      "utf8",
    );
    expect(markerText).toContain('"source": "LOCAL_VALIDATION"');
    expect(markerText).not.toContain("ORDER1");
    expect(markerText).not.toContain("test-only-access");
    const unavailable = child("recover-unavailable");
    expect(unavailable.status).toBe(1);
    expect(JSON.parse(unavailable.stdout.trim())).toMatchObject({
      source: "LOCAL_VALIDATION",
      status: "UNKNOWN",
      provider_capture_calls: 1,
    });
    const finalUnavailable = child("recover-final-read-unavailable");
    expect(finalUnavailable.status).toBe(1);
    expect(JSON.parse(finalUnavailable.stdout.trim())).toMatchObject({
      source: "LOCAL_VALIDATION",
      status: "PAID",
      operation_status: "SUCCEEDED",
      receipt_count: 1,
      provider_capture_calls: 1,
    });
    const resumed = child("recover");
    expect(resumed.status, resumed.stderr).toBe(0);
    const result = JSON.parse(resumed.stdout.trim());
    expect(result).toMatchObject({
      source: "LOCAL_VALIDATION",
      status: "RECOVERED",
      provider_create_calls: 1,
      provider_capture_calls: 1,
      capture_count: 1,
      receipt_count: 1,
      receipt_verified: true,
      stock_committed: true,
      new_payment_created: false,
      resumed_finalized_state: true,
      manual_provider_evidence_review_required: true,
    });
    const resultFile = path.join(directory, "result-retention.json");
    expect(recordRecoveryResult(resultFile, result).status).toBe("RECOVERED");
    const original = readFileSync(resultFile, "utf8");
    expect(
      recordRecoveryResult(resultFile, {
        ...result,
        observed_at: new Date().toISOString(),
      }),
    ).toMatchObject({
      status: "ALREADY_RECORDED",
      original_result_retained: true,
      new_payment_created: false,
    });
    expect(readFileSync(resultFile, "utf8")).toBe(original);
    expect(() =>
      recordRecoveryResult(resultFile, {
        ...result,
        order_sha256: "different-order",
      }),
    ).toThrow("EXISTING_RECOVERY_RESULT_MISMATCH");
    expect(readFileSync(resultFile, "utf8")).toBe(original);
  } finally {
    const resolved = path.resolve(directory);
    if (!resolved.startsWith(root + path.sep))
      throw new Error("TEST_CLEANUP_PATH_OUTSIDE_WORKSPACE");
    rmSync(resolved, { recursive: true, force: true });
  }
}, 60000);

import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteObject, getBytes, ref, uploadBytes } from "firebase/storage";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here=dirname(fileURLToPath(import.meta.url));
const rules=readFileSync(join(here,"proposals/REGLAS-STORAGE-COMUNIDAD-PARA-COPIAR.rules"),"utf8");
const testEnv=await initializeTestEnvironment({projectId:"demo-nalvi-community-media",storage:{rules}});
const token={name:"Alicia Duarte",email:"alicia@example.com",firebase:{sign_in_provider:"google.com"}};
const image=new Uint8Array([82,73,70,70,1,2,3,4]);
const metadata={contentType:"image/webp",customMetadata:{ownerUid:"alicia"}};

try{
  const guest=testEnv.unauthenticatedContext().storage();
  const anonymous=testEnv.authenticatedContext("anonymous",{firebase:{sign_in_provider:"anonymous"}}).storage();
  const alicia=testEnv.authenticatedContext("alicia",token).storage();
  const marcelo=testEnv.authenticatedContext("marcelo",{...token,name:"Marcelo",email:"marcelo@example.com"}).storage();
  const avatar=ref(alicia,"communityMedia/alicia/profile/avatar");
  const cover=ref(alicia,"communityMedia/alicia/profile/cover");
  const postImage=ref(alicia,"communityMedia/alicia/posts/123456789abc");

  await assertSucceeds(uploadBytes(avatar,image,metadata));
  await assertSucceeds(uploadBytes(cover,image,metadata));
  await assertSucceeds(uploadBytes(postImage,image,metadata));
  await assertSucceeds(getBytes(ref(guest,"communityMedia/alicia/profile/avatar")));
  await assertFails(uploadBytes(ref(anonymous,"communityMedia/anonymous/profile/avatar"),image,{contentType:"image/webp",customMetadata:{ownerUid:"anonymous"}}));
  await assertFails(uploadBytes(ref(marcelo,"communityMedia/alicia/profile/avatar"),image,{contentType:"image/webp",customMetadata:{ownerUid:"marcelo"}}));
  await assertFails(uploadBytes(ref(alicia,"communityMedia/alicia/profile/other"),image,metadata));
  await assertFails(uploadBytes(ref(alicia,"communityMedia/alicia/posts/short"),image,metadata));
  await assertFails(uploadBytes(ref(alicia,"communityMedia/alicia/posts/123456789def"),image,{contentType:"application/pdf",customMetadata:{ownerUid:"alicia"}}));
  await assertFails(uploadBytes(ref(alicia,"communityMedia/alicia/posts/123456789ghi"),image,{contentType:"image/webp",customMetadata:{ownerUid:"otra"}}));
  await assertFails(deleteObject(ref(marcelo,"communityMedia/alicia/profile/avatar")));
  await assertSucceeds(deleteObject(avatar));
  console.log("PASS imágenes públicas y escrituras aisladas por usuario");
}finally{
  await testEnv.cleanup();
}

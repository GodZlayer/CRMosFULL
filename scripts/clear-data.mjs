import { createRepository } from "../server/repository.mjs";

const repository = createRepository();

try {
  const result = repository.clearBusinessData();
  console.log("Dados operacionais removidos com sucesso.");
  console.log(JSON.stringify(result.summary, null, 2));
} finally {
  repository.close();
}

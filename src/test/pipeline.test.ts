import { canTransition, nextPipelineStatus, PIPELINE_ORDER } from "@/server/contracts/pipeline";

describe("máquina de estados do pipeline", () => {
  it("avança uma etapa por tick", () => {
    expect(nextPipelineStatus("coletando")).toBe("lendo");
    expect(nextPipelineStatus("lendo")).toBe("consolidando");
    expect(nextPipelineStatus("consolidando")).toBe("aguardando_revisao");
    expect(nextPipelineStatus("aguardando_revisao")).toBeNull();
  });

  it("permite qualquer etapa falhar para erro", () => {
    for (const s of PIPELINE_ORDER) expect(canTransition(s, "erro")).toBe(true);
  });

  it("erro e concluido são terminais (sem pular etapas)", () => {
    expect(canTransition("erro", "lendo")).toBe(false);
    expect(canTransition("concluido", "lendo")).toBe(false);
    expect(canTransition("coletando", "aguardando_revisao")).toBe(false);
    expect(canTransition("coletando", "coletando")).toBe(false);
  });
});

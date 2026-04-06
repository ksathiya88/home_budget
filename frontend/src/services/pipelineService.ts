const PIPELINE_URL = process.env.REACT_APP_PIPELINE_URL || "/api/pipeline";

export type PipelineItem = {
  name: string;
  price: number;
  category: string;
  confidence: number;
};

export type PipelineResult = {
  text: string;
  items: PipelineItem[];
};

export const runPipeline = async (imageBase64: string, householdId?: string): Promise<PipelineResult> => {
  const res = await fetch(PIPELINE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64, householdId })
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Pipeline error ${res.status}: ${body}`);
  }

  return (await res.json()) as PipelineResult;
};

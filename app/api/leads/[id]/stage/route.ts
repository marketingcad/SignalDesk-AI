import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth";
import { updateLeadStage } from "@/lib/leads";
import { PIPELINE_STAGES } from "@/lib/types";
import type { PipelineStage } from "@/lib/types";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token || !(await verifySession(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  let body: { pipelineStage?: string; stagePosition?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { pipelineStage, stagePosition } = body;

  if (!pipelineStage || !PIPELINE_STAGES.includes(pipelineStage as PipelineStage)) {
    return NextResponse.json(
      { error: "Invalid pipelineStage. Must be one of: " + PIPELINE_STAGES.join(", ") },
      { status: 400 }
    );
  }

  if (typeof stagePosition !== "number" || Number.isNaN(stagePosition)) {
    return NextResponse.json(
      { error: "Invalid stagePosition. Must be a number." },
      { status: 400 }
    );
  }

  try {
    const lead = await updateLeadStage(id, pipelineStage as PipelineStage, stagePosition);
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    return NextResponse.json({ lead });
  } catch (error) {
    console.error("[api/leads/[id]/stage] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

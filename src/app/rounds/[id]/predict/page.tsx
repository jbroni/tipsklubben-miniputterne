"use client";

import { use } from "react";
import { PredictionForm } from "@/components/PredictionForm";

export default function PredictPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { id } = use(params);
  const { from } = use(searchParams);

  return (
    <PredictionForm
      roundId={id}
      backHref={from === "rounds" ? "/rounds" : "/"}
    />
  );
}

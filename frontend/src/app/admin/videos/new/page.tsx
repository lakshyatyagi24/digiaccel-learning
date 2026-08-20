"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { VideoForm } from "@/features/videos/video-form";
import { useCreateVideo } from "@/features/videos/hooks";

export default function NewVideoPage() {
  const router = useRouter();
  const createVideo = useCreateVideo();

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Create video</h1>
        <p className="text-sm text-slate-500">
          Add the basic details. You can add timestamp questions after saving.
        </p>
      </div>
      <Card>
        <CardContent className="pt-6">
          <VideoForm
            submitLabel="Create video"
            submitting={createVideo.isPending}
            onSubmit={(values) => {
              createVideo.mutate(
                {
                  ...values,
                  description: values.description || undefined,
                  thumbnailUrl: values.thumbnailUrl || undefined,
                },
                {
                  onSuccess: (video) =>
                    router.push(`/admin/videos/${video.id}`),
                },
              );
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}

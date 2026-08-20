"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const videoFormSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().optional(),
  thumbnailUrl: z
    .string()
    .url("Enter a valid URL")
    .optional()
    .or(z.literal("")),
  videoUrl: z.string().url("Enter a valid video URL"),
  durationSeconds: z.coerce
    .number()
    .int()
    .min(1, "Duration must be at least 1 second")
    .max(36000),
});

export type VideoFormValues = z.infer<typeof videoFormSchema>;

export function VideoForm({
  defaultValues,
  onSubmit,
  submitting,
  submitLabel = "Save",
}: {
  defaultValues?: Partial<VideoFormValues>;
  onSubmit: (values: VideoFormValues) => void;
  submitting?: boolean;
  submitLabel?: string;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<VideoFormValues>({
    resolver: zodResolver(videoFormSchema),
    defaultValues,
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          aria-invalid={!!errors.title}
          {...register("title")}
        />
        {errors.title && (
          <p className="text-xs text-red-600">{errors.title.message}</p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" rows={3} {...register("description")} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="thumbnailUrl">Thumbnail URL</Label>
        <Input
          id="thumbnailUrl"
          aria-invalid={!!errors.thumbnailUrl}
          {...register("thumbnailUrl")}
        />
        {errors.thumbnailUrl && (
          <p className="text-xs text-red-600">{errors.thumbnailUrl.message}</p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="videoUrl">Video URL</Label>
        <Input
          id="videoUrl"
          aria-invalid={!!errors.videoUrl}
          {...register("videoUrl")}
        />
        {errors.videoUrl && (
          <p className="text-xs text-red-600">{errors.videoUrl.message}</p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="durationSeconds">Duration (seconds)</Label>
        <Input
          id="durationSeconds"
          type="number"
          aria-invalid={!!errors.durationSeconds}
          {...register("durationSeconds")}
        />
        {errors.durationSeconds && (
          <p className="text-xs text-red-600">
            {errors.durationSeconds.message}
          </p>
        )}
      </div>
      <Button type="submit" loading={submitting}>
        {submitLabel}
      </Button>
    </form>
  );
}

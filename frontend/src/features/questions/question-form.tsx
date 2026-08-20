"use client";

import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Question, QuestionType } from "@/lib/types";

const optionSchema = z.object({
  text: z.string().min(1, "Required"),
  isCorrect: z.boolean(),
});

const questionSchema = z
  .object({
    type: z.enum(["SINGLE_CHOICE", "MULTIPLE_CHOICE", "SHORT_ANSWER"]),
    timestampSeconds: z.coerce.number().int().min(0, "Must be 0 or greater"),
    text: z.string().min(1, "Question text is required"),
    options: z.array(optionSchema),
  })
  .superRefine((data, ctx) => {
    if (data.type === "SHORT_ANSWER") return;
    if (data.options.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "Add at least 2 options",
      });
      return;
    }
    const correctCount = data.options.filter((o) => o.isCorrect).length;
    if (data.type === "SINGLE_CHOICE" && correctCount !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "Select exactly one correct option",
      });
    }
    if (data.type === "MULTIPLE_CHOICE" && correctCount < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "Select at least one correct option",
      });
    }
  });

export type QuestionFormValues = z.infer<typeof questionSchema>;

export function QuestionForm({
  videoDurationSeconds,
  initialValues,
  onSubmit,
  submitting,
}: {
  videoDurationSeconds: number;
  initialValues?: Question;
  onSubmit: (values: QuestionFormValues) => void;
  submitting?: boolean;
}) {
  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<QuestionFormValues>({
    resolver: zodResolver(questionSchema),
    defaultValues: initialValues
      ? {
          type: initialValues.type,
          timestampSeconds: initialValues.timestampSeconds,
          text: initialValues.text,
          options: initialValues.options.map((o) => ({
            text: o.text,
            isCorrect: !!o.isCorrect,
          })),
        }
      : {
          type: "SINGLE_CHOICE",
          timestampSeconds: 0,
          text: "",
          options: [
            { text: "", isCorrect: false },
            { text: "", isCorrect: false },
          ],
        },
  });
  const { fields, append, remove } = useFieldArray({
    control,
    name: "options",
  });
  const type = watch("type");

  return (
    <form
      onSubmit={handleSubmit((values) =>
        onSubmit({
          ...values,
          options: type === "SHORT_ANSWER" ? [] : values.options,
        }),
      )}
      className="space-y-4"
      noValidate
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="q-type">Question type</Label>
          <Select
            value={type}
            onValueChange={(v) => setValue("type", v as QuestionType)}
          >
            <SelectTrigger id="q-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="SINGLE_CHOICE">Single choice</SelectItem>
              <SelectItem value="MULTIPLE_CHOICE">Multiple choice</SelectItem>
              <SelectItem value="SHORT_ANSWER">Short answer</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="q-timestamp">
            Timestamp (seconds, max {videoDurationSeconds})
          </Label>
          <Input
            id="q-timestamp"
            type="number"
            min={0}
            max={videoDurationSeconds}
            aria-invalid={!!errors.timestampSeconds}
            {...register("timestampSeconds")}
          />
          {errors.timestampSeconds && (
            <p className="text-xs text-red-600">
              {errors.timestampSeconds.message}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="q-text">Question text</Label>
        <Input id="q-text" aria-invalid={!!errors.text} {...register("text")} />
        {errors.text && (
          <p className="text-xs text-red-600">{errors.text.message}</p>
        )}
      </div>

      {type !== "SHORT_ANSWER" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Options</Label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => append({ text: "", isCorrect: false })}
            >
              <Plus className="mr-1 h-3.5 w-3.5" /> Add option
            </Button>
          </div>
          {fields.map((field, index) => (
            <div key={field.id} className="flex items-center gap-2">
              <input
                type={type === "SINGLE_CHOICE" ? "radio" : "checkbox"}
                name="correct-option"
                checked={!!watch(`options.${index}.isCorrect`)}
                onChange={(e) => {
                  if (type === "SINGLE_CHOICE") {
                    fields.forEach((_, i) =>
                      setValue(`options.${i}.isCorrect`, i === index),
                    );
                  } else {
                    setValue(`options.${index}.isCorrect`, e.target.checked);
                  }
                }}
                aria-label={`Mark option ${index + 1} as correct`}
                className="h-4 w-4 shrink-0"
              />
              <Input
                {...register(`options.${index}.text` as const)}
                placeholder={`Option ${index + 1}`}
                className="flex-1"
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => remove(index)}
                disabled={fields.length <= 2}
                aria-label="Remove option"
              >
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            </div>
          ))}
          {errors.options && (
            <p className="text-xs text-red-600">{errors.options.message}</p>
          )}
        </div>
      )}

      <Button type="submit" loading={submitting}>
        {initialValues ? "Save changes" : "Add question"}
      </Button>
    </form>
  );
}

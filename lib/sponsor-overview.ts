import type { Task } from "@/lib/types";

export type SponsorOverviewTask = Pick<Task, "title" | "category" | "status" | "due_date" | "quantity">;

export type SponsorOverviewCategory = {
  category: string;
  confirmed: string[];
  awaitingReview: string[];
  pending: string[];
  overdue: string[];
  fullyConfirmed: boolean;
  paragraph: string;
};

export type SponsorOverview = {
  totalCategories: number;
  fullyConfirmedCategories: number;
  categoriesWithPending: number;
  categoriesWithOverdue: number;
  daysUntilEvent: number;
  categories: SponsorOverviewCategory[];
};

const categoryOrder = ["Booth", "Panels", "Roundtable", "Case study", "Branding", "Tickets", "Private Meeting Room", "10 Meetings", "Roundtable/Meeting/Tour Options", "Meetings", "Tours", "Workshops", "Innovation", "Networking"];

function normalizeCategory(category: string) {
  const value = category.toLowerCase();
  if (value.includes("roundtable/meeting/tour options")) return "Roundtable/Meeting/Tour Options";
  if (value.includes("private meeting room")) return "Private Meeting Room";
  if (value.includes("10 meetings")) return "10 Meetings";
  if (value.includes("booth")) return "Booth";
  if (value.includes("panel")) return "Panels";
  if (value.includes("roundtable")) return "Roundtable";
  if (value.includes("case study")) return "Case study";
  if (value.includes("branding") || value.includes("pillar")) return "Branding";
  if (value.includes("ticket")) return "Tickets";
  if (value.includes("meeting")) return "Meetings";
  if (value.includes("tour")) return "Tours";
  if (value.includes("workshop")) return "Workshops";
  if (value.includes("innovation")) return "Innovation";
  if (value.includes("networking")) return "Networking";
  return category;
}

function itemName(task: SponsorOverviewTask) {
  if (task.quantity <= 1) return task.title;
  const category = task.category.toLowerCase();
  if (category.includes("ticket")) return `${task.title} (${task.quantity} tickets)`;
  if (category.includes("panel")) return `${task.title} (${task.quantity} panels)`;
  if (category.includes("pillar")) return `${task.title} (${task.quantity} pillars)`;
  return task.title;
}

function joinItems(items: string[]) {
  if (items.length < 2) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

export function classifySponsorTask(task: SponsorOverviewTask, now = new Date()): "confirmed" | "review" | "pending" | "overdue" {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (task.status === "Complete") return "confirmed";
  if (task.status === "pending_review" || task.status === "With Our Team") return "review";
  if (task.status === "Overdue") return "overdue";
  if (task.status === "Needs You" && task.due_date && new Date(`${task.due_date}T00:00:00.000Z`) < today) return "overdue";
  return "pending";
}

function daysToEvent(eventStartDate: string, today: Date) {
  const eventDate = new Date(`${eventStartDate}T00:00:00.000Z`);
  const todayDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  return Math.ceil((eventDate.getTime() - todayDate.getTime()) / 86_400_000);
}

function paragraphForCategory(
  category: string,
  confirmed: string[],
  awaitingReview: string[],
  pending: string[],
  overdue: string[],
  daysUntilEvent: number,
) {
  const sentences: string[] = [];
  if (confirmed.length) sentences.push(`Confirmed: ${joinItems(confirmed)}.`);

  if (pending.length) {
    const deadline = daysUntilEvent >= 0
      ? `with ${daysUntilEvent} days remaining before the event.`
      : `the event date passed ${Math.abs(daysUntilEvent)} days ago.`;
    sentences.push(`Still needed from the sponsor: ${joinItems(pending)}, ${deadline}`);
  }
  if (awaitingReview.length) {
    sentences.push(`Submitted and awaiting your review: ${joinItems(awaitingReview)}.`);
  }
  if (overdue.length) {
    sentences.push(`${overdue.length} ${overdue.length === 1 ? "item is" : "items are"} past deadline${overdue.length === 1 ? "" : "s"}: ${joinItems(overdue)}.`);
  }
  if (!pending.length && !awaitingReview.length && !overdue.length) {
    sentences.push("This category is fully confirmed.");
  } else if (!confirmed.length && !pending.length && !overdue.length) {
    sentences.push("All sponsor submissions in this category are awaiting review.");
  }
  return `${category}: ${sentences.join(" ")}`;
}

export function buildSponsorOverview(tasks: SponsorOverviewTask[], eventStartDate: string, now = new Date()): SponsorOverview {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const daysUntilEvent = daysToEvent(eventStartDate, today);
  const grouped = new Map<string, SponsorOverviewTask[]>();
  for (const task of tasks) {
    const category = normalizeCategory(task.category);
    const group = grouped.get(category) ?? [];
    group.push(task);
    grouped.set(category, group);
  }

  const categories = Array.from(grouped.entries()).map(([category, categoryTasks]) => {
    const confirmed: string[] = [];
    const awaitingReview: string[] = [];
    const pending: string[] = [];
    const overdue: string[] = [];
    for (const task of categoryTasks) {
      const name = itemName(task);
      const state = classifySponsorTask(task, today);
      if (state === "confirmed") confirmed.push(name);
      else if (state === "review") awaitingReview.push(name);
      else if (state === "overdue") overdue.push(name);
      else pending.push(name);
    }
    const fullyConfirmed = categoryTasks.length > 0 && confirmed.length === categoryTasks.length;
    return {
      category,
      confirmed,
      awaitingReview,
      pending,
      overdue,
      fullyConfirmed,
      paragraph: paragraphForCategory(category, confirmed, awaitingReview, pending, overdue, daysUntilEvent),
    };
  }).sort((a, b) => {
    const aOverdue = a.overdue.length > 0;
    const bOverdue = b.overdue.length > 0;
    if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
    const aOrder = categoryOrder.indexOf(a.category);
    const bOrder = categoryOrder.indexOf(b.category);
    if (aOrder === -1 && bOrder !== -1) return 1;
    if (bOrder === -1 && aOrder !== -1) return -1;
    return aOrder === -1 && bOrder === -1 ? a.category.localeCompare(b.category) : aOrder - bOrder;
  });

  return {
    totalCategories: categories.length,
    fullyConfirmedCategories: categories.filter((category) => category.fullyConfirmed).length,
    categoriesWithPending: categories.filter((category) => category.pending.length > 0 || category.awaitingReview.length > 0).length,
    categoriesWithOverdue: categories.filter((category) => category.overdue.length > 0).length,
    daysUntilEvent,
    categories,
  };
}

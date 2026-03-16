-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE');

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "creator_telegram_id" BIGINT NOT NULL,
    "group_chat_id" BIGINT,
    "settings" JSONB NOT NULL DEFAULT '{"notificationsEnabled": true}',
    "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "members" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "display_name" TEXT NOT NULL,
    "telegram_username" TEXT,

    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "assignee_id" UUID,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_dependencies" (
    "task_id" UUID NOT NULL,
    "depends_on_task_id" UUID NOT NULL,

    CONSTRAINT "task_dependencies_pkey" PRIMARY KEY ("task_id","depends_on_task_id")
);

-- CreateTable
CREATE TABLE "todos" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "is_completed" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "todos_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_depends_on_task_id_fkey" FOREIGN KEY ("depends_on_task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "todos" ADD CONSTRAINT "todos_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

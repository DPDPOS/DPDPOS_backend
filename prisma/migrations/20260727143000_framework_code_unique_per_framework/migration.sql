-- AlterUniqueIndex: scope control/requirement codes to framework

DROP INDEX IF EXISTS "controls_organization_id_code_key";
DROP INDEX IF EXISTS "requirements_organization_id_code_key";

CREATE UNIQUE INDEX "controls_framework_id_code_key" ON "controls"("framework_id", "code");
CREATE UNIQUE INDEX "requirements_framework_id_code_key" ON "requirements"("framework_id", "code");

export interface Skill {
    id: string;
    name: string;
    description: string;
    prompt: string;
    createdAt: number;
}

export interface SkillSettings {
    id: string;
    skillId: string;
    enabled: boolean;
    name: string;
    description: string;
    prompt: string;
}

export interface SkillSettingsUpdate {
    enabled?: boolean;
    name?: string;
    description?: string;
    prompt?: string;
}

export function getSkillSelectionUpdate({
    messageCount,
    defaultSkill,
    selectedSkill,
    selectedSkillMode,
}: {
    messageCount: number;
    defaultSkill: Skill | null;
    selectedSkill: Skill | null;
    selectedSkillMode: "auto" | "manual";
}): Skill | null | undefined {
    if (messageCount > 0) {
        if (selectedSkillMode === "auto" && selectedSkill) {
            return null;
        }
        return undefined;
    }

    if (selectedSkillMode === "manual") {
        return undefined;
    }

    if (defaultSkill && selectedSkill?.id !== defaultSkill.id) {
        return defaultSkill;
    }

    if (!defaultSkill && selectedSkill) {
        return null;
    }

    return undefined;
}

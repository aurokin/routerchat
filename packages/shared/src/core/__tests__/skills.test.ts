import { describe, expect, it } from "vitest";
import type { Skill } from "../skills";
import { getSkillSelectionUpdate } from "../skills";

const defaultSkill: Skill = {
    id: "skill-default",
    name: "Default",
    description: "default",
    prompt: "prompt",
    createdAt: 1,
};

const selectedSkill: Skill = {
    id: "skill-selected",
    name: "Selected",
    description: "selected",
    prompt: "prompt",
    createdAt: 2,
};

describe("getSkillSelectionUpdate", () => {
    it("returns null when auto mode already selected after messages", () => {
        expect(
            getSkillSelectionUpdate({
                messageCount: 3,
                defaultSkill,
                selectedSkill,
                selectedSkillMode: "auto",
            }),
        ).toBeNull();
    });

    it("returns undefined when manual mode after messages", () => {
        expect(
            getSkillSelectionUpdate({
                messageCount: 2,
                defaultSkill,
                selectedSkill,
                selectedSkillMode: "manual",
            }),
        ).toBeUndefined();
    });

    it("keeps manual mode selection when no messages", () => {
        expect(
            getSkillSelectionUpdate({
                messageCount: 0,
                defaultSkill,
                selectedSkill,
                selectedSkillMode: "manual",
            }),
        ).toBeUndefined();
    });

    it("returns default skill when auto mode and different", () => {
        expect(
            getSkillSelectionUpdate({
                messageCount: 0,
                defaultSkill,
                selectedSkill,
                selectedSkillMode: "auto",
            }),
        ).toEqual(defaultSkill);
    });

    it("clears selected skill when default is removed", () => {
        expect(
            getSkillSelectionUpdate({
                messageCount: 0,
                defaultSkill: null,
                selectedSkill,
                selectedSkillMode: "auto",
            }),
        ).toBeNull();
    });
});

"use client";

import { useState } from "react";
import { Book, Plus, Edit2, Trash2 } from "lucide-react";
import { useSettings } from "@/contexts/SettingsContext";
import type { Skill } from "@/lib/types";

export function SettingsSkills() {
    const { skills, addSkill, updateSkill, deleteSkill } = useSettings();

    const [showSkillForm, setShowSkillForm] = useState(false);
    const [editingSkillId, setEditingSkillId] = useState<string | null>(null);
    const [skillName, setSkillName] = useState("");
    const [skillDescription, setSkillDescription] = useState("");
    const [skillPrompt, setSkillPrompt] = useState("");

    const openNewSkillForm = () => {
        setEditingSkillId(null);
        setSkillName("");
        setSkillDescription("");
        setSkillPrompt("");
        setShowSkillForm(true);
    };

    const openEditSkillForm = (skill: Skill) => {
        setEditingSkillId(skill.id);
        setSkillName(skill.name);
        setSkillDescription(skill.description);
        setSkillPrompt(skill.prompt);
        setShowSkillForm(true);
    };

    const closeSkillForm = () => {
        setShowSkillForm(false);
        setEditingSkillId(null);
        setSkillName("");
        setSkillDescription("");
        setSkillPrompt("");
    };

    const handleSaveSkill = () => {
        if (!skillName.trim() || !skillPrompt.trim()) return;

        if (editingSkillId) {
            updateSkill(editingSkillId, {
                name: skillName.trim(),
                description: skillDescription.trim(),
                prompt: skillPrompt.trim(),
            });
        } else {
            addSkill({
                name: skillName.trim(),
                description: skillDescription.trim(),
                prompt: skillPrompt.trim(),
            });
        }

        closeSkillForm();
    };

    const handleDeleteSkill = (id: string) => {
        if (confirm("Are you sure you want to delete this skill?")) {
            deleteSkill(id);
        }
    };

    return (
        <section className="card-deco mb-6">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-primary/10 flex items-center justify-center">
                        <Book size={16} className="text-primary" />
                    </div>
                    <h2 className="text-lg font-medium">Skills</h2>
                </div>
                <button
                    onClick={openNewSkillForm}
                    className="btn-deco btn-deco-primary flex items-center gap-2 cursor-pointer"
                >
                    <Plus size={14} />
                    <span className="text-sm">New Skill</span>
                </button>
            </div>
            <p className="text-sm text-muted-foreground mb-3 leading-relaxed">
                Create reusable prompt templates that are prepended to your
                messages when selected.
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
                The last skill you pick becomes the default for new chats and
                applies to the first message only. Choose None to clear it.
            </p>

            {/* Skill Form */}
            {showSkillForm && (
                <div className="mb-6 p-5 border border-primary/30 bg-primary/5">
                    <h3 className="font-medium mb-4 text-primary">
                        {editingSkillId ? "Edit Skill" : "New Skill"}
                    </h3>
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="skillName" className="label-deco">
                                Name
                            </label>
                            <input
                                id="skillName"
                                type="text"
                                value={skillName}
                                onChange={(e) => setSkillName(e.target.value)}
                                placeholder="e.g., Code Reviewer"
                                className="input-deco"
                            />
                        </div>
                        <div>
                            <label
                                htmlFor="skillDescription"
                                className="label-deco"
                            >
                                Description (optional)
                            </label>
                            <input
                                id="skillDescription"
                                type="text"
                                value={skillDescription}
                                onChange={(e) =>
                                    setSkillDescription(e.target.value)
                                }
                                placeholder="e.g., Expert at reviewing code for bugs"
                                className="input-deco"
                            />
                        </div>
                        <div>
                            <label htmlFor="skillPrompt" className="label-deco">
                                Prompt
                            </label>
                            <textarea
                                id="skillPrompt"
                                value={skillPrompt}
                                onChange={(e) => setSkillPrompt(e.target.value)}
                                placeholder="You are an expert code reviewer..."
                                className="input-deco min-h-[120px] resize-y"
                            />
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={handleSaveSkill}
                                disabled={
                                    !skillName.trim() || !skillPrompt.trim()
                                }
                                className="btn-deco btn-deco-primary cursor-pointer"
                            >
                                <span className="text-sm">
                                    {editingSkillId ? "Update" : "Create"}
                                </span>
                            </button>
                            <button
                                onClick={closeSkillForm}
                                className="btn-deco btn-deco-secondary cursor-pointer"
                            >
                                <span className="text-sm">Cancel</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Skills List */}
            {skills.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground border border-dashed border-border bg-muted/20">
                    <Book size={36} className="mx-auto mb-3 opacity-40" />
                    <p className="text-sm">No skills created yet</p>
                    <p className="text-xs mt-1 opacity-70">
                        Click &quot;New Skill&quot; to create your first skill
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {skills.map((skill) => (
                        <div
                            key={skill.id}
                            className="p-4 border border-border bg-background-elevated hover:border-primary/30 transition-all duration-200 group"
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-medium truncate text-foreground">
                                        {skill.name}
                                    </h4>
                                    {skill.description && (
                                        <p className="text-sm text-muted-foreground truncate mt-1">
                                            {skill.description}
                                        </p>
                                    )}
                                    <p className="text-xs text-muted-foreground/70 mt-2 line-clamp-2 font-mono">
                                        {skill.prompt}
                                    </p>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => openEditSkillForm(skill)}
                                        className="p-2 hover:bg-muted border border-transparent hover:border-border transition-colors"
                                        title="Edit"
                                    >
                                        <Edit2
                                            size={14}
                                            className="text-muted-foreground hover:text-foreground"
                                        />
                                    </button>
                                    <button
                                        onClick={() =>
                                            handleDeleteSkill(skill.id)
                                        }
                                        className="p-2 hover:bg-error/10 border border-transparent hover:border-error/30 transition-colors"
                                        title="Delete"
                                    >
                                        <Trash2
                                            size={14}
                                            className="text-error"
                                        />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}

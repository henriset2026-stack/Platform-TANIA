-- ==========================================================================
-- SECURITY GATE #1, SG-09 (MEDIUM): no self-scoring of AI augmentation.
--
-- ai_augmentation holds per-person scores (research … overall_score) that
-- feed the AI Augmentation performance dimension. ai_augmentation_write only
-- asks for ai.analyze and can_access_profile(profile_id); TALENT holds
-- ai.analyze and can_access_profile(self) is true, so a talent could write
-- their own scores — the same defect as SG-04 on evidence.
-- tests/rls/security-gate.rls.test.ts reproduced it on 2026-09-24.
--
-- RESTRICTIVE, so it only subtracts from the existing permissive policy.
-- ==========================================================================

drop policy if exists ai_augmentation_no_self_insert on public.ai_augmentation;
create policy ai_augmentation_no_self_insert on public.ai_augmentation
  as restrictive for insert to authenticated
  with check (profile_id <> auth.uid());

drop policy if exists ai_augmentation_no_self_update on public.ai_augmentation;
create policy ai_augmentation_no_self_update on public.ai_augmentation
  as restrictive for update to authenticated
  using (profile_id <> auth.uid())
  with check (profile_id <> auth.uid());

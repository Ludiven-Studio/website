-- Test builds of the PetanqueMeet app, linked from /rencontres/test/.
-- Public bucket: anyone with the URL can read. No storage.objects policy is added,
-- so only the service role (tools/publish_test_apk.py in PetanqueMeet) can write.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('builds', 'builds', true, 104857600,
        array['application/vnd.android.package-archive', 'application/json'])
on conflict (id) do nothing;

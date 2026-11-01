#!/usr/bin/env bash
set -euo pipefail

: "${GH_REPO:?Missing GitHub repository}"
: "${RELEASE_TAG:?Missing release tag}"
: "${GITHUB_SHA:?Missing verified commit}"

# List failures must stop publication; only a successful empty result means absent.
# RELEASE_TAG comes from the validated version declaration in this workflow.
draft=$(gh api --paginate "repos/$GH_REPO/releases" \
  --jq ".[] | select(.tag_name == \"$RELEASE_TAG\") | .draft")
if [[ "$draft" == "false" ]]; then
  echo "$RELEASE_TAG is already published; skipping."
  exit 0
fi
if [[ -n "$draft" && "$draft" != "true" ]]; then
  echo "Unexpected release state for $RELEASE_TAG" >&2
  exit 1
fi

# Never move an existing tag or attach another commit's builds to it.
remote_tag=$(git ls-remote --tags origin "refs/tags/$RELEASE_TAG")
if [[ -n "$remote_tag" ]]; then
  git fetch --no-tags origin "refs/tags/$RELEASE_TAG"
  if [[ "$(git rev-parse 'FETCH_HEAD^{commit}')" != "$GITHUB_SHA" ]]; then
    echo "$RELEASE_TAG already points to another commit; increment the version." >&2
    exit 1
  fi
else
  git tag "$RELEASE_TAG" "$GITHUB_SHA"
  git push origin "refs/tags/$RELEASE_TAG"
fi

prerelease=false
if [[ "${RELEASE_TAG#cli-v}" == *-* ]]; then
  prerelease=true
fi
if [[ -z "$draft" ]]; then
  args=(--verify-tag --draft --generate-notes --title "VNVE $RELEASE_TAG")
  if [[ "$prerelease" == "true" ]]; then
    args+=(--prerelease)
  fi
  gh release create "$RELEASE_TAG" "${args[@]}"
fi

# A retry may replace attachments only on an unpublished draft for the same commit.
# Publish after every upload succeeds, so consumers never see a partial release.
gh release upload "$RELEASE_TAG" dist/vnve-* LICENSE --clobber
gh release edit "$RELEASE_TAG" --draft=false --prerelease="$prerelease"

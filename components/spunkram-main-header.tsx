"use client";

import { useState } from "react";
import { Header } from "@/components/header";
import {
  DEFAULT_SEARCH_CATEGORY,
  type SearchCategory,
} from "@/lib/search-categories";

export function SpunkramMainHeader() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchCategory, setSearchCategory] =
    useState<SearchCategory>(DEFAULT_SEARCH_CATEGORY);

  return (
    <Header
      showSearch={false}
      showBrand={true}
      authorNavPopovers
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      searchCategory={searchCategory}
      onSearchCategoryChange={setSearchCategory}
      containerClassName="mx-auto w-full max-w-7xl px-5 sm:px-8 lg:px-8"
      fixed={false}
    />
  );
}

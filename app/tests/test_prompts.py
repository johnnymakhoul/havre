# © 2024 Thoughtworks, Inc. | Licensed under the Apache License, Version 2.0  | See LICENSE.md file for permissions.
from tests.utils import get_test_data_path
from knowledge.markdown import KnowledgeBaseMarkdown
from prompts.prompts import PromptList, filter_downloadable_prompts
from unittest.mock import MagicMock

TEST_KNOWLEDGE_PACK_PATH = get_test_data_path() + "/test_knowledge_pack"
ACTIVE_KNOWLEDGE_CONTEXT = "context_a"
CONTEXT_B = "context_b"


def create_knowledge_manager():
    return MagicMock()


def create_knowledge_base(knowledge_pack_path):
    knowledge_base = KnowledgeBaseMarkdown()
    knowledge_base.load_for_context(
        ACTIVE_KNOWLEDGE_CONTEXT,
        knowledge_pack_path + "/contexts/" + ACTIVE_KNOWLEDGE_CONTEXT + ".md",
    )
    knowledge_base.load_for_context(
        CONTEXT_B,
        knowledge_pack_path + "/contexts/" + CONTEXT_B + ".md",
    )
    return knowledge_base


def test_init_should_load_files():
    knowledge_base = create_knowledge_base(TEST_KNOWLEDGE_PACK_PATH)
    knowledge_manager = create_knowledge_manager()

    prompt_list = PromptList(
        "chat", knowledge_base, knowledge_manager, root_dir=TEST_KNOWLEDGE_PACK_PATH
    )
    assert len(prompt_list.prompts) == 7


def test_init_should_exclude_readmes():
    knowledge_base = create_knowledge_base(TEST_KNOWLEDGE_PACK_PATH)
    knowledge_manager = create_knowledge_manager()

    prompt_list = PromptList(
        "chat", knowledge_base, knowledge_manager, root_dir=TEST_KNOWLEDGE_PACK_PATH
    )
    assert len(prompt_list.prompts) == 7


def test_init_should_set_defaults_for_metadata():
    knowledge_base = create_knowledge_base(TEST_KNOWLEDGE_PACK_PATH)
    knowledge_manager = create_knowledge_manager()

    prompt_list = PromptList(
        "chat", knowledge_base, knowledge_manager, root_dir=TEST_KNOWLEDGE_PACK_PATH
    )
    prompt_to_assert = next(
        filter(
            lambda prompt: prompt.metadata["identifier"] == "uuid-0",
            prompt_list.prompts,
        ),
        None,
    )
    assert prompt_to_assert.metadata["title"] == "Test0"
    assert prompt_to_assert.metadata["categories"] == []
    assert prompt_to_assert.metadata["type"] == "chat"
    assert prompt_to_assert.metadata["editable"] is False
    assert prompt_to_assert.metadata["show"] is True


def test_get_should_return_prompt_data():
    knowledge_base = create_knowledge_base(TEST_KNOWLEDGE_PACK_PATH)
    knowledge_manager = create_knowledge_manager()

    prompt_list = PromptList(
        "chat", knowledge_base, knowledge_manager, root_dir=TEST_KNOWLEDGE_PACK_PATH
    )
    prompt = prompt_list.get("uuid-1")
    assert prompt.metadata["title"] == "Test1"


def test_create_template():
    knowledge_base = create_knowledge_base(TEST_KNOWLEDGE_PACK_PATH)
    knowledge_manager = create_knowledge_manager()

    prompt_list = PromptList(
        "chat", knowledge_base, knowledge_manager, root_dir=TEST_KNOWLEDGE_PACK_PATH
    )
    template = prompt_list.create_template("uuid-3")
    assert template.template == "Content: {user_input} | Business: {context}"


def test_create_and_render_template_with_missing_variables():
    knowledge_base = create_knowledge_base(TEST_KNOWLEDGE_PACK_PATH)
    knowledge_manager = create_knowledge_manager()

    prompt_list = PromptList(
        "chat", knowledge_base, knowledge_manager, root_dir=TEST_KNOWLEDGE_PACK_PATH
    )
    rendered, _ = prompt_list.create_and_render_template(
        "uuid-3",
        {"user_input": "Some User Input"},
    )
    assert (
        rendered
        == "Content: Some User Input | Business: None provided, please try to help without this information."
    )


def test_render_prompt_with_additional_vars():
    knowledge_base = create_knowledge_base(TEST_KNOWLEDGE_PACK_PATH)
    knowledge_manager = create_knowledge_manager()

    prompt_list = PromptList(
        "chat", knowledge_base, knowledge_manager, root_dir=TEST_KNOWLEDGE_PACK_PATH
    )
    rendered, _ = prompt_list.render_prompt(
        "uuid-4",
        "Some User Input",
        {"additional": "Additional Var"},
    )
    assert rendered == "Content Some User Input Additional Var"


def test_filter_should_filter_by_one_category_and_include_without_category():
    knowledge_base = create_knowledge_base(TEST_KNOWLEDGE_PACK_PATH)
    knowledge_manager = create_knowledge_manager()

    prompt_list = PromptList(
        "chat", knowledge_base, knowledge_manager, root_dir=TEST_KNOWLEDGE_PACK_PATH
    )
    prompt_list.filter(["architecture"])
    assert len(prompt_list.prompts) == 4


def test_filter_should_filter_by_multiple_categories():
    knowledge_base = create_knowledge_base(TEST_KNOWLEDGE_PACK_PATH)
    knowledge_manager = create_knowledge_manager()

    prompt_list = PromptList(
        "chat", knowledge_base, knowledge_manager, root_dir=TEST_KNOWLEDGE_PACK_PATH
    )
    prompt_list.filter(["architecture", "coding"])
    assert len(prompt_list.prompts) == 5


def test_render_prompt_without_prompt_choice():
    knowledge_base = create_knowledge_base(TEST_KNOWLEDGE_PACK_PATH)
    knowledge_manager = create_knowledge_manager()
    prompt_list = PromptList(
        "chat", knowledge_base, knowledge_manager, root_dir=TEST_KNOWLEDGE_PACK_PATH
    )
    rendered, _ = prompt_list.render_prompt(None, "Some User Input")
    assert rendered == ""


def test_create_markdown_summary():
    knowledge_base = create_knowledge_base(TEST_KNOWLEDGE_PACK_PATH)
    knowledge_manager = create_knowledge_manager()

    prompt_list = PromptList(
        "chat", knowledge_base, knowledge_manager, root_dir=TEST_KNOWLEDGE_PACK_PATH
    )
    markdown_summary = prompt_list.render_prompts_summary_markdown()

    expected_summary = (
        "- **Test4**: Prompt description 4\n- **Test5**: Prompt description 5\n"
    )

    assert expected_summary in markdown_summary


def test_get_prompts_with_follow_ups():
    knowledge_base = create_knowledge_base(TEST_KNOWLEDGE_PACK_PATH)
    knowledge_manager = create_knowledge_manager()

    prompt_list = PromptList(
        "chat", knowledge_base, knowledge_manager, root_dir=TEST_KNOWLEDGE_PACK_PATH
    )
    prompts_with_follow_ups = prompt_list.get_prompts_with_follow_ups()

    uuid_1_entry = [
        prompt for prompt in prompts_with_follow_ups if prompt["identifier"] == "uuid-1"
    ][0]
    assert uuid_1_entry is not None
    assert len(uuid_1_entry["follow_ups"]) == 2
    assert "grounded" in uuid_1_entry
    assert uuid_1_entry["grounded"] is False
    assert uuid_1_entry["follow_ups"][0]["identifier"] == "uuid-2"
    assert uuid_1_entry["follow_ups"][0]["title"] == "Test2"
    assert "prompt 2" in uuid_1_entry["follow_ups"][0]["help_prompt_description"]
    assert uuid_1_entry["follow_ups"][1]["identifier"] == "uuid-3"
    assert uuid_1_entry["follow_ups"][1]["title"] == "Test3"
    assert "prompt 3" in uuid_1_entry["follow_ups"][1]["help_prompt_description"]

    uuid_3_entry = [
        prompt for prompt in prompts_with_follow_ups if prompt["identifier"] == "uuid-3"
    ][0]
    assert uuid_3_entry is not None
    assert uuid_3_entry["follow_ups"] == []


def test_get_prompts_with_follow_ups_invalid_prompt_id():
    knowledge_base = create_knowledge_base(TEST_KNOWLEDGE_PACK_PATH)
    knowledge_manager = create_knowledge_manager()

    prompt_list = PromptList(
        "chat", knowledge_base, knowledge_manager, root_dir=TEST_KNOWLEDGE_PACK_PATH
    )
    prompts_with_follow_ups = prompt_list.get_prompts_with_follow_ups()

    # test knowledge pack configures invalid follow-up and valid follow-up for uuid-2

    uuid_2_entry = [
        prompt for prompt in prompts_with_follow_ups if prompt["identifier"] == "uuid-2"
    ][0]
    assert uuid_2_entry is not None
    assert len(uuid_2_entry["follow_ups"]) == 1
    assert uuid_2_entry["follow_ups"][0]["identifier"] == "uuid-3"


def test_get_prompts_with_follow_ups_with_categor_and_download_prompt():
    knowledge_base = create_knowledge_base(TEST_KNOWLEDGE_PACK_PATH)
    knowledge_manager = create_knowledge_manager()

    prompt_list = PromptList(
        "chat", knowledge_base, knowledge_manager, root_dir=TEST_KNOWLEDGE_PACK_PATH
    )

    # Get prompts with category "architecture" and download_prompt=True
    prompts_with_follow_ups = prompt_list.get_prompts_with_follow_ups(
        download_prompt=True, category="architecture"
    )

    # Verify only prompts with "architecture" category are returned
    assert all(
        "architecture" in prompt["categories"] for prompt in prompts_with_follow_ups
    )

    # Verify content is included in the response
    uuid_1_entry = [
        prompt for prompt in prompts_with_follow_ups if prompt["identifier"] == "uuid-1"
    ][0]
    assert uuid_1_entry["content"] == "Content {user_input} {context}"

    uuid_5_entry = [
        prompt for prompt in prompts_with_follow_ups if prompt["identifier"] == "uuid-5"
    ][0]
    assert uuid_5_entry["content"] == "Content  {context}"


def test_prompt_content_for_download():
    knowledge_base = create_knowledge_base(TEST_KNOWLEDGE_PACK_PATH)
    knowledge_manager = create_knowledge_manager()

    prompt_list = PromptList(
        "chat", knowledge_base, knowledge_manager, root_dir=TEST_KNOWLEDGE_PACK_PATH
    )

    # Create a mock prompt with type "cards"
    mock_cards_prompt = MagicMock()
    mock_cards_prompt.content = "Test cards content"
    mock_cards_prompt.metadata = {"type": "cards"}

    # Create a mock prompt with type "chat"
    mock_chat_prompt = MagicMock()
    mock_chat_prompt.content = "Test chat content"
    mock_chat_prompt.metadata = {"type": "chat"}

    # Test cards prompt content formatting - verify the exact full string
    expected_cards_content = "Test cards content\n\n##OUTPUT INSTRUCTIONS: \n\nYou will respond in Markdown format. If it is an array, respond in tabular format."
    cards_content = prompt_list.prompt_content_for_download(mock_cards_prompt)
    assert cards_content == expected_cards_content

    # Test chat prompt content (should be unchanged)
    chat_content = prompt_list.prompt_content_for_download(mock_chat_prompt)
    assert chat_content == "Test chat content"


def test_attach_follow_ups_for_chat_prompt():
    knowledge_base = create_knowledge_base(TEST_KNOWLEDGE_PACK_PATH)
    knowledge_manager = create_knowledge_manager()

    prompt_list = PromptList(
        "chat", knowledge_base, knowledge_manager, root_dir=TEST_KNOWLEDGE_PACK_PATH
    )

    # Get a prompt known to have follow-ups
    prompt = prompt_list.get("uuid-1")

    # Test default behavior (download_prompt=False)
    result = prompt_list.attach_follow_ups(prompt)

    # Verify basic metadata is included
    assert result["identifier"] == "uuid-1"
    assert result["title"] == "Test1"
    assert "content" not in result  # Content should not be included by default

    # Verify follow-ups are attached
    assert len(result["follow_ups"]) == 2
    assert result["follow_ups"][0]["identifier"] == "uuid-2"
    assert result["follow_ups"][1]["identifier"] == "uuid-3"

    # Test with download_prompt=True
    result_with_download = prompt_list.attach_follow_ups(prompt, download_prompt=True)

    # Content should now be included
    assert "content" in result_with_download
    assert result_with_download["content"] == prompt.content


def test_attach_follow_ups_for_cards_prompt():
    knowledge_base = create_knowledge_base(TEST_KNOWLEDGE_PACK_PATH)
    knowledge_manager = create_knowledge_manager()

    prompt_list = PromptList(
        "chat", knowledge_base, knowledge_manager, root_dir=TEST_KNOWLEDGE_PACK_PATH
    )

    # Test with a cards-type prompt and download_prompt=True
    cards_prompt = MagicMock()
    cards_prompt.content = "Test cards content"
    cards_prompt.metadata = {
        "identifier": "test-cards",
        "type": "cards",
        "title": "Test Cards",
        "categories": ["test"],
        "help_prompt_description": "Test description",
        "grounded": False,
    }

    # Mock the get_follow_ups method to return empty list for this test prompt
    prompt_list.get_follow_ups = MagicMock(return_value=[])

    result_cards = prompt_list.attach_follow_ups(cards_prompt, download_prompt=True)

    # Verify content is formatted for cards-type with exact string comparison
    expected_content = "Test cards content\n\n##OUTPUT INSTRUCTIONS: \n\nYou will respond in Markdown format. If it is an array, respond in tabular format."
    assert "content" in result_cards
    assert result_cards["content"] == expected_content


class TestPromptList:
    def test_attach_follow_ups_includes_download_restricted_field(self):
        # Create a mock prompt with download_restricted field
        mock_prompt = type(
            "MockPrompt",
            (),
            {
                "metadata": {
                    "identifier": "test-prompt",
                    "title": "Test Prompt",
                    "categories": ["test"],
                    "help_prompt_description": "Test description",
                    "help_user_input": "Test input",
                    "help_sample_input": "Test sample",
                    "type": "chat",
                    "scenario_queries": [],
                    "editable": False,
                    "show": True,
                    "filename": "test",
                    "grounded": False,
                    "download_restricted": True,
                    "content": "Test content",
                }
            },
        )()

        # Create a minimal PromptList instance for testing
        prompt_list = PromptList.__new__(PromptList)
        prompt_list.prompt_flows = []  # Mock empty flows

        # Test the attach_follow_ups method
        result = prompt_list.attach_follow_ups(mock_prompt)

        assert "download_restricted" in result
        assert result["download_restricted"] is True

    def test_attach_follow_ups_defaults_download_restricted_to_false(self):
        # Create a mock prompt without download_restricted field
        mock_prompt = type(
            "MockPrompt",
            (),
            {
                "metadata": {
                    "identifier": "test-prompt",
                    "title": "Test Prompt",
                    "categories": ["test"],
                    "help_prompt_description": "Test description",
                    "help_user_input": "Test input",
                    "help_sample_input": "Test sample",
                    "type": "chat",
                    "scenario_queries": [],
                    "editable": False,
                    "show": True,
                    "filename": "test",
                    "grounded": False,
                    "content": "Test content",
                    # No download_restricted field
                }
            },
        )()

        # Create a minimal PromptList instance for testing
        prompt_list = PromptList.__new__(PromptList)
        prompt_list.prompt_flows = []  # Mock empty flows

        # Test the attach_follow_ups method
        result = prompt_list.attach_follow_ups(mock_prompt)

        assert "download_restricted" in result
        assert result["download_restricted"] is False

    def test_filter_downloadable_prompts(self):
        # Create test prompts with different download_restricted values
        test_prompts = [
            {"identifier": "prompt-1", "download_restricted": False},
            {"identifier": "prompt-2", "download_restricted": True},
            {"identifier": "prompt-3", "download_restricted": False},
            {"identifier": "prompt-4", "download_restricted": True},
            {"identifier": "prompt-5", "download_restricted": False},
        ]

        # Test the filtering function
        filtered_prompts = filter_downloadable_prompts(test_prompts)

        assert len(filtered_prompts) == 3
        assert filtered_prompts[0]["identifier"] == "prompt-1"
        assert filtered_prompts[1]["identifier"] == "prompt-3"
        assert filtered_prompts[2]["identifier"] == "prompt-5"

    def test_filter_downloadable_prompts_with_missing_field(self):
        # Create test prompts with missing download_restricted field
        test_prompts = [
            {"identifier": "prompt-1", "download_restricted": False},
            {"identifier": "prompt-2"},  # Missing download_restricted field
            {"identifier": "prompt-3", "download_restricted": True},
            {"identifier": "prompt-4"},  # Missing download_restricted field
        ]

        # Test the filtering function
        filtered_prompts = filter_downloadable_prompts(test_prompts)

        assert len(filtered_prompts) == 3
        assert filtered_prompts[0]["identifier"] == "prompt-1"
        assert (
            filtered_prompts[1]["identifier"] == "prompt-2"
        )  # Should be included (defaults to False)
        assert (
            filtered_prompts[2]["identifier"] == "prompt-4"
        )  # Should be included (defaults to False)


def test_volere_constraints_prompt_metadata_and_rendering():
    import os
    import tempfile
    import shutil

    resources_prompts_chat = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "resources",
        "prompts_chat",
    )

    with tempfile.TemporaryDirectory() as tmp_pack:
        chat_dir = os.path.join(tmp_pack, "prompts", "chat")
        os.makedirs(chat_dir, exist_ok=True)
        for fname in os.listdir(resources_prompts_chat):
            shutil.copy(
                os.path.join(resources_prompts_chat, fname),
                os.path.join(chat_dir, fname),
            )

        knowledge_base = create_knowledge_base(TEST_KNOWLEDGE_PACK_PATH)
        knowledge_manager = create_knowledge_manager()
        prompt_list = PromptList(
            "chat", knowledge_base, knowledge_manager, root_dir=tmp_pack
        )

        volere_prompt = prompt_list.get("requirements-constraints-volere-4a1b2c3d")
        assert volere_prompt is not None
        assert volere_prompt.metadata["title"] == "Requirements Constraints"
        assert volere_prompt.metadata["categories"] == ["analysis"]
        assert volere_prompt.metadata["type"] == "cards"
        assert volere_prompt.metadata["editable"] is True
        assert prompt_list.produces_json_output(
            "requirements-constraints-volere-4a1b2c3d"
        )

        rendered, template = prompt_list.render_prompt(
            "requirements-constraints-volere-4a1b2c3d",
            "Must integrate with legacy SAP and comply with GDPR.",
            {"context": "European B2B CRM platform"},
        )
        assert "context" in template.input_variables
        assert "user_input" in template.input_variables
        assert "European B2B CRM platform" in rendered
        assert "Must integrate with legacy SAP and comply with GDPR." in rendered
        assert "volere_category" in rendered
        assert "**Description**" in rendered
        assert "**Rationale**" in rendered
        assert "**Fit Criterion**" in rendered
        assert "**Impact on Delivery**" in rendered
        assert "self-review" in rendered

        follow_ups = prompt_list.get_follow_ups(
            "requirements-constraints-volere-4a1b2c3d"
        )
        assert len(follow_ups) >= 1
        assert (
            follow_ups[0]["identifier"]
            == "requirements-constraints-volere-spec-8f9e1d2c"
        )
        assert follow_ups[0]["title"] == "Volere Constraints Specification Document"


def test_togaf_baseline_assessment_prompts_and_flows():
    import os
    import tempfile
    import shutil

    resources_prompts_chat = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "resources",
        "prompts_chat",
    )

    with tempfile.TemporaryDirectory() as tmp_pack:
        chat_dir = os.path.join(tmp_pack, "prompts", "chat")
        os.makedirs(chat_dir, exist_ok=True)
        for fname in os.listdir(resources_prompts_chat):
            shutil.copy(
                os.path.join(resources_prompts_chat, fname),
                os.path.join(chat_dir, fname),
            )

        knowledge_base = create_knowledge_base(TEST_KNOWLEDGE_PACK_PATH)
        knowledge_manager = create_knowledge_manager()
        prompt_list = PromptList(
            "chat", knowledge_base, knowledge_manager, root_dir=tmp_pack
        )

        # Step 1: Cards prompt
        togaf_cards = prompt_list.get("togaf-baseline-assessment-cards-7b2e9a1c")
        assert togaf_cards is not None
        assert togaf_cards.metadata["title"] == "Baseline Architecture Assessment"
        assert togaf_cards.metadata["categories"] == ["architecture", "analysis"]
        assert togaf_cards.metadata["type"] == "cards"
        assert togaf_cards.metadata["editable"] is True
        assert prompt_list.produces_json_output(
            "togaf-baseline-assessment-cards-7b2e9a1c"
        )

        rendered_cards, template_cards = prompt_list.render_prompt(
            "togaf-baseline-assessment-cards-7b2e9a1c",
            "Legacy Java monolith with nightly CSV sync from SAP.",
            {"context": "B2B Order Management System"},
        )
        assert "context" in template_cards.input_variables
        assert "user_input" in template_cards.input_variables
        assert "B2B Order Management System" in rendered_cards
        assert "Legacy Java monolith with nightly CSV sync from SAP." in rendered_cards
        assert "togaf_phase" in rendered_cards
        assert "pain_points" in rendered_cards
        assert "criticality_and_debt" in rendered_cards
        assert "self-review" in rendered_cards

        # Step 2: Report prompt
        dossier_prompt = prompt_list.get("togaf-baseline-dossier-8c3f1e2a")
        assert dossier_prompt is not None
        assert (
            dossier_prompt.metadata["title"]
            == "Baseline Architecture Assessment Report"
        )
        assert dossier_prompt.metadata["type"] == "chat"
        assert dossier_prompt.metadata["show"] is False

        # Step 3: Gap Analysis prompt
        gap_prompt = prompt_list.get("togaf-gap-analysis-9d4a2b3e")
        assert gap_prompt is not None
        assert gap_prompt.metadata["title"] == "TOGAF Gap Analysis & Modernization Options"
        assert gap_prompt.metadata["type"] == "chat"
        assert gap_prompt.metadata["show"] is False

        # Verify 3-step follow-up flow
        follow_ups = prompt_list.get_follow_ups(
            "togaf-baseline-assessment-cards-7b2e9a1c"
        )
        follow_up_ids = [f["identifier"] for f in follow_ups]
        assert "togaf-baseline-dossier-8c3f1e2a" in follow_up_ids
        assert "togaf-gap-analysis-9d4a2b3e" in follow_up_ids
        assert "requirements-constraints-volere-spec-8f9e1d2c" in follow_up_ids


def test_cost_analysis_prompts_and_flows():
    import os
    import tempfile
    import shutil

    resources_prompts_chat = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "resources",
        "prompts_chat",
    )

    with tempfile.TemporaryDirectory() as tmp_pack:
        chat_dir = os.path.join(tmp_pack, "prompts", "chat")
        os.makedirs(chat_dir, exist_ok=True)
        for fname in os.listdir(resources_prompts_chat):
            shutil.copy(
                os.path.join(resources_prompts_chat, fname),
                os.path.join(chat_dir, fname),
            )

        knowledge_base = create_knowledge_base(TEST_KNOWLEDGE_PACK_PATH)
        knowledge_manager = create_knowledge_manager()
        prompt_list = PromptList(
            "chat", knowledge_base, knowledge_manager, root_dir=tmp_pack
        )

        # Step 1: Cost Analysis cards prompt
        cost_cards = prompt_list.get("cost-analysis-cards-5e8b3c1a")
        assert cost_cards is not None
        assert cost_cards.metadata["title"] == "Cost Analysis"
        assert cost_cards.metadata["categories"] == ["analysis", "architecture"]
        assert cost_cards.metadata["type"] == "cards"
        assert cost_cards.metadata["editable"] is True
        assert prompt_list.produces_json_output("cost-analysis-cards-5e8b3c1a")

        rendered_cards, template_cards = prompt_list.render_prompt(
            "cost-analysis-cards-5e8b3c1a",
            "Requirements: offline sync. Constraints: €3k/mo OpEx ceiling. Chosen Solution: React PWA + AKS + Multi-AZ Postgres.",
            {"context": "B2B Field Sales CRM"},
        )
        assert "context" in template_cards.input_variables
        assert "user_input" in template_cards.input_variables
        assert "B2B Field Sales CRM" in rendered_cards
        assert "Chosen Solution: React PWA + AKS + Multi-AZ Postgres." in rendered_cards
        assert "cost_category" in rendered_cards
        assert "source_driver" in rendered_cards
        assert "**Cost Breakdown & Sizing**" in rendered_cards
        assert "**Assumptions**" in rendered_cards
        assert "**Budget & Constraint Impact**" in rendered_cards
        assert "**Optimization / Trade-off Lever**" in rendered_cards
        assert "self-review" in rendered_cards

        # Step 2: TCO & Budget Alignment Report prompt
        tco_report = prompt_list.get("cost-analysis-tco-report-6f9d4a2b")
        assert tco_report is not None
        assert tco_report.metadata["title"] == "TCO & Budget Alignment Report"
        assert tco_report.metadata["type"] == "chat"
        assert tco_report.metadata["show"] is False

        # Verify follow-ups from Cost Analysis and upstream prompts
        cost_follow_ups = [
            f["identifier"]
            for f in prompt_list.get_follow_ups("cost-analysis-cards-5e8b3c1a")
        ]
        assert "cost-analysis-tco-report-6f9d4a2b" in cost_follow_ups
        assert "requirements-constraints-volere-spec-8f9e1d2c" in cost_follow_ups
        assert "togaf-gap-analysis-9d4a2b3e" in cost_follow_ups


def test_market_research_prompts_and_flows():
    import os
    import tempfile
    import shutil

    resources_prompts_chat = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "resources",
        "prompts_chat",
    )

    with tempfile.TemporaryDirectory() as tmp_pack:
        chat_dir = os.path.join(tmp_pack, "prompts", "chat")
        os.makedirs(chat_dir, exist_ok=True)
        for fname in os.listdir(resources_prompts_chat):
            shutil.copy(
                os.path.join(resources_prompts_chat, fname),
                os.path.join(chat_dir, fname),
            )

        knowledge_base = create_knowledge_base(TEST_KNOWLEDGE_PACK_PATH)
        knowledge_manager = create_knowledge_manager()
        prompt_list = PromptList(
            "chat", knowledge_base, knowledge_manager, root_dir=tmp_pack
        )

        # Step 1: Market Research cards prompt
        market_cards = prompt_list.get("market-research-cards-2c7f4e9b")
        assert market_cards is not None
        assert market_cards.metadata["title"] == "Market Research"
        assert market_cards.metadata["categories"] == ["research", "analysis"]
        assert market_cards.metadata["type"] == "cards"
        assert market_cards.metadata["editable"] is True
        assert prompt_list.produces_json_output("market-research-cards-2c7f4e9b")

        rendered_cards, template_cards = prompt_list.render_prompt(
            "market-research-cards-2c7f4e9b",
            "Mobile field sales CRM for European food & beverage wholesale distributors.",
            {"context": "B2B Wholesale Distribution"},
        )
        assert "context" in template_cards.input_variables
        assert "user_input" in template_cards.input_variables
        assert "B2B Wholesale Distribution" in rendered_cards
        assert (
            "Mobile field sales CRM for European food & beverage wholesale distributors."
            in rendered_cards
        )
        assert "research_dimension" in rendered_cards
        assert "Target Users & Personas" in rendered_cards
        assert "User Needs & Pain Points" in rendered_cards
        assert "Available Market Solutions" in rendered_cards
        assert "Competitive Landscape (Concurrence)" in rendered_cards
        assert "**Overview**" in rendered_cards
        assert "**Current Market Reality & Strengths**" in rendered_cards
        assert "**Gaps, Weaknesses & Friction**" in rendered_cards
        assert "**Strategic Implication for Our Product**" in rendered_cards
        assert "self-review" in rendered_cards

        # Step 2: Market Research & Competitive Analysis Report prompt
        market_report = prompt_list.get("market-research-report-3d8a5b1e")
        assert market_report is not None
        assert (
            market_report.metadata["title"]
            == "Market Research & Competitive Analysis Report"
        )
        assert market_report.metadata["type"] == "chat"
        assert market_report.metadata["show"] is False

        # Verify follow-ups from Market Research
        market_follow_ups = [
            f["identifier"]
            for f in prompt_list.get_follow_ups("market-research-cards-2c7f4e9b")
        ]
        assert "market-research-report-3d8a5b1e" in market_follow_ups
        assert "requirements-constraints-volere-spec-8f9e1d2c" in market_follow_ups
        assert "cost-analysis-tco-report-6f9d4a2b" in market_follow_ups


def test_adr_prompts_and_flows():
    import os
    import tempfile
    import shutil

    resources_prompts_chat = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "resources",
        "prompts_chat",
    )

    with tempfile.TemporaryDirectory() as tmp_pack:
        chat_dir = os.path.join(tmp_pack, "prompts", "chat")
        os.makedirs(chat_dir, exist_ok=True)
        for fname in os.listdir(resources_prompts_chat):
            shutil.copy(
                os.path.join(resources_prompts_chat, fname),
                os.path.join(chat_dir, fname),
            )

        knowledge_base = create_knowledge_base(TEST_KNOWLEDGE_PACK_PATH)
        knowledge_manager = create_knowledge_manager()
        prompt_list = PromptList(
            "chat", knowledge_base, knowledge_manager, root_dir=tmp_pack
        )

        # Step 1: Architecture Decision Records cards prompt
        adr_cards = prompt_list.get("adr-cards-4f8a1c6e")
        assert adr_cards is not None
        assert adr_cards.metadata["title"] == "Architecture Decision Records"
        assert adr_cards.metadata["categories"] == ["architecture"]
        assert adr_cards.metadata["type"] == "cards"
        assert adr_cards.metadata["editable"] is True
        assert prompt_list.produces_json_output("adr-cards-4f8a1c6e")

        rendered_cards, template_cards = prompt_list.render_prompt(
            "adr-cards-4f8a1c6e",
            "Decide between AKS microservices vs. modular monolith on Azure Container Apps under a €3k/mo OpEx ceiling.",
            {"context": "B2B Field Sales Platform"},
        )
        assert "context" in template_cards.input_variables
        assert "user_input" in template_cards.input_variables
        assert "B2B Field Sales Platform" in rendered_cards
        assert "modular monolith on Azure Container Apps" in rendered_cards
        assert "adr_domain" in rendered_cards
        assert "status" in rendered_cards
        assert "**Context & Problem**" in rendered_cards
        assert "**Decision Drivers & Constraints**" in rendered_cards
        assert "**Considered Options**" in rendered_cards
        assert "**Recommended Decision & Rationale**" in rendered_cards
        assert "**Consequences & Trade-offs**" in rendered_cards
        assert "self-review" in rendered_cards

        # Step 2: ADR Specification Document (MADR) prompt
        adr_spec = prompt_list.get("adr-madr-spec-5a9b2d7f")
        assert adr_spec is not None
        assert adr_spec.metadata["title"] == "ADR Specification Document (MADR)"
        assert adr_spec.metadata["type"] == "chat"
        assert adr_spec.metadata["show"] is False

        # Verify follow-ups from ADR cards
        adr_follow_ups = [
            f["identifier"]
            for f in prompt_list.get_follow_ups("adr-cards-4f8a1c6e")
        ]
        assert "adr-poc-spike-spec-3e0a5f2b" in adr_follow_ups
        assert "adr-madr-spec-5a9b2d7f" in adr_follow_ups
        assert "schedule-roadmap-report-7c2e4f9a" in adr_follow_ups
        assert "cost-analysis-tco-report-6f9d4a2b" in adr_follow_ups
        assert "togaf-gap-analysis-9d4a2b3e" in adr_follow_ups
        assert "requirements-constraints-volere-spec-8f9e1d2c" in adr_follow_ups

        # Step 3: ADR PoC Spike cards prompt
        spike_cards = prompt_list.get("adr-poc-spike-cards-2f9b4e1a")
        assert spike_cards is not None
        assert spike_cards.metadata["title"] == "ADR PoC & Spike Scenarios"
        assert spike_cards.metadata["categories"] == ["architecture"]
        assert spike_cards.metadata["type"] == "cards"
        assert spike_cards.metadata["editable"] is True
        assert prompt_list.produces_json_output("adr-poc-spike-cards-2f9b4e1a")

        rendered_spike_cards, template_spike_cards = prompt_list.render_prompt(
            "adr-poc-spike-cards-2f9b4e1a",
            "Validate CRDT offline sync vs Operational Transformation under network partition.",
            {"context": "Field sales mobile app"},
        )
        assert "context" in template_spike_cards.input_variables
        assert "user_input" in template_spike_cards.input_variables
        assert "Field sales mobile app" in rendered_spike_cards
        assert "CRDT offline sync" in rendered_spike_cards
        assert "verification_command" in rendered_spike_cards

        # Step 4: ADR PoC Spike spec prompt
        spike_spec = prompt_list.get("adr-poc-spike-spec-3e0a5f2b")
        assert spike_spec is not None
        assert spike_spec.metadata["title"] == "ADR PoC Spike Specification & Code Generator"
        assert spike_spec.metadata["type"] == "chat"
        assert spike_spec.metadata["show"] is False

        # Verify follow-ups from Spike cards
        spike_follow_ups = [
            f["identifier"]
            for f in prompt_list.get_follow_ups("adr-poc-spike-cards-2f9b4e1a")
        ]
        assert "adr-poc-spike-spec-3e0a5f2b" in spike_follow_ups
        assert "adr-madr-spec-5a9b2d7f" in spike_follow_ups


def test_schedule_estimation_prompts_and_flows():
    import os
    import tempfile
    import shutil

    resources_prompts_chat = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "resources",
        "prompts_chat",
    )

    with tempfile.TemporaryDirectory() as tmp_pack:
        chat_dir = os.path.join(tmp_pack, "prompts", "chat")
        os.makedirs(chat_dir, exist_ok=True)
        for fname in os.listdir(resources_prompts_chat):
            shutil.copy(
                os.path.join(resources_prompts_chat, fname),
                os.path.join(chat_dir, fname),
            )

        knowledge_base = create_knowledge_base(TEST_KNOWLEDGE_PACK_PATH)
        knowledge_manager = create_knowledge_manager()
        prompt_list = PromptList(
            "chat", knowledge_base, knowledge_manager, root_dir=tmp_pack
        )

        # Step 1: Schedule Estimation & Planning cards prompt
        schedule_cards = prompt_list.get("schedule-estimation-cards-6b1d3e8f")
        assert schedule_cards is not None
        assert schedule_cards.metadata["title"] == "Schedule Estimation & Planning"
        assert schedule_cards.metadata["categories"] == ["analysis", "architecture"]
        assert schedule_cards.metadata["type"] == "cards"
        assert schedule_cards.metadata["editable"] is True
        assert prompt_list.produces_json_output("schedule-estimation-cards-6b1d3e8f")

        rendered_cards, template_cards = prompt_list.render_prompt(
            "schedule-estimation-cards-6b1d3e8f",
            "Deliver cloud-native Customer Order Portal within 6 months with 2 squads.",
            {"context": "Legacy Monolith Replacement"},
        )
        assert "context" in template_cards.input_variables
        assert "user_input" in template_cards.input_variables
        assert "Legacy Monolith Replacement" in rendered_cards
        assert (
            "Deliver cloud-native Customer Order Portal within 6 months with 2 squads."
            in rendered_cards
        )
        assert "delivery_phase" in rendered_cards
        assert "scope_and_deliverables" in rendered_cards
        assert "effort_estimate" in rendered_cards
        assert "dependencies_and_critical_path" in rendered_cards
        assert "schedule_risks_and_buffers" in rendered_cards
        assert "self-review" in rendered_cards

        # Step 2: Delivery Roadmap & Schedule Estimation Report prompt
        roadmap_report = prompt_list.get("schedule-roadmap-report-7c2e4f9a")
        assert roadmap_report is not None
        assert (
            roadmap_report.metadata["title"]
            == "Delivery Roadmap & Schedule Estimation Report"
        )
        assert roadmap_report.metadata["type"] == "chat"
        assert roadmap_report.metadata["show"] is False

        # Verify follow-ups from Schedule Estimation cards
        schedule_follow_ups = [
            f["identifier"]
            for f in prompt_list.get_follow_ups("schedule-estimation-cards-6b1d3e8f")
        ]
        assert "schedule-roadmap-report-7c2e4f9a" in schedule_follow_ups
        assert "cost-analysis-tco-report-6f9d4a2b" in schedule_follow_ups
        assert "legal-contracts-report-9e4a6b2d" in schedule_follow_ups
        assert "adr-madr-spec-5a9b2d7f" in schedule_follow_ups
        assert "requirements-constraints-volere-spec-8f9e1d2c" in schedule_follow_ups
        assert "togaf-gap-analysis-9d4a2b3e" in schedule_follow_ups


def test_legal_contracts_prompts_and_flows():
    import os
    import tempfile
    import shutil

    resources_prompts_chat = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "resources",
        "prompts_chat",
    )

    with tempfile.TemporaryDirectory() as tmp_pack:
        chat_dir = os.path.join(tmp_pack, "prompts", "chat")
        os.makedirs(chat_dir, exist_ok=True)
        for fname in os.listdir(resources_prompts_chat):
            shutil.copy(
                os.path.join(resources_prompts_chat, fname),
                os.path.join(chat_dir, fname),
            )

        knowledge_base = create_knowledge_base(TEST_KNOWLEDGE_PACK_PATH)
        knowledge_manager = create_knowledge_manager()
        prompt_list = PromptList(
            "chat", knowledge_base, knowledge_manager, root_dir=tmp_pack
        )

        # Step 1: Legal & Contracts cards prompt
        legal_cards = prompt_list.get("legal-contracts-cards-8d3f5a1c")
        assert legal_cards is not None
        assert legal_cards.metadata["title"] == "Legal & Contracts"
        assert legal_cards.metadata["categories"] == ["analysis", "architecture"]
        assert legal_cards.metadata["type"] == "cards"
        assert legal_cards.metadata["editable"] is True
        assert prompt_list.produces_json_output("legal-contracts-cards-8d3f5a1c")

        rendered_cards, template_cards = prompt_list.render_prompt(
            "legal-contracts-cards-8d3f5a1c",
            "EU customer PII processed on AWS eu-central-1 with external US LLM sub-processor and 99.9% SLA.",
            {"context": "European B2B Order Platform"},
        )
        assert "context" in template_cards.input_variables
        assert "user_input" in template_cards.input_variables
        assert "European B2B Order Platform" in rendered_cards
        assert (
            "EU customer PII processed on AWS eu-central-1 with external US LLM sub-processor and 99.9% SLA."
            in rendered_cards
        )
        assert "legal_category" in rendered_cards
        assert "risk_severity_and_status" in rendered_cards
        assert "**Contractual / Regulatory Requirement**" in rendered_cards
        assert "**Architecture & Delivery Impact**" in rendered_cards
        assert "**Identified Exposure / Gap**" in rendered_cards
        assert "**Recommended Redline / Technical Control**" in rendered_cards
        assert "self-review" in rendered_cards

        # Step 2: Legal, Regulatory & Contract Compliance Report prompt
        legal_report = prompt_list.get("legal-contracts-report-9e4a6b2d")
        assert legal_report is not None
        assert (
            legal_report.metadata["title"]
            == "Legal, Regulatory & Contract Compliance Report"
        )
        assert legal_report.metadata["type"] == "chat"
        assert legal_report.metadata["show"] is False

        # Verify follow-ups from Legal & Contracts cards
        legal_follow_ups = [
            f["identifier"]
            for f in prompt_list.get_follow_ups("legal-contracts-cards-8d3f5a1c")
        ]
        assert "legal-contracts-report-9e4a6b2d" in legal_follow_ups
        assert "requirements-constraints-volere-spec-8f9e1d2c" in legal_follow_ups
        assert "adr-madr-spec-5a9b2d7f" in legal_follow_ups
        assert "cost-analysis-tco-report-6f9d4a2b" in legal_follow_ups
        assert "schedule-roadmap-report-7c2e4f9a" in legal_follow_ups
        assert "togaf-gap-analysis-9d4a2b3e" in legal_follow_ups


def test_sdlc_methodologies_prompts_and_flows():
    import os
    import tempfile
    import shutil

    resources_prompts_chat = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "resources",
        "prompts_chat",
    )

    with tempfile.TemporaryDirectory() as tmp_pack:
        chat_dir = os.path.join(tmp_pack, "prompts", "chat")
        os.makedirs(chat_dir, exist_ok=True)
        for fname in os.listdir(resources_prompts_chat):
            shutil.copy(
                os.path.join(resources_prompts_chat, fname),
                os.path.join(chat_dir, fname),
            )

        knowledge_base = create_knowledge_base(TEST_KNOWLEDGE_PACK_PATH)
        knowledge_manager = create_knowledge_manager()
        prompt_list = PromptList(
            "chat", knowledge_base, knowledge_manager, root_dir=tmp_pack
        )

        # Step 1: SDLC Methodologies cards prompt
        sdlc_cards = prompt_list.get("sdlc-methodologies-cards-1a4b7c9e")
        assert sdlc_cards is not None
        assert sdlc_cards.metadata["title"] == "SDLC Methodologies"
        assert sdlc_cards.metadata["categories"] == ["analysis", "architecture"]
        assert sdlc_cards.metadata["type"] == "cards"
        assert sdlc_cards.metadata["editable"] is True
        assert prompt_list.produces_json_output("sdlc-methodologies-cards-1a4b7c9e")

        rendered_cards, template_cards = prompt_list.render_prompt(
            "sdlc-methodologies-cards-1a4b7c9e",
            "2 squads modernizing legacy ERP with quarterly steering gates and strict SOX audit compliance.",
            {"context": "Enterprise Core ERP Replacement"},
        )
        assert "context" in template_cards.input_variables
        assert "user_input" in template_cards.input_variables
        assert "Enterprise Core ERP Replacement" in rendered_cards
        assert (
            "2 squads modernizing legacy ERP with quarterly steering gates and strict SOX audit compliance."
            in rendered_cards
        )
        assert "sdlc_dimension" in rendered_cards
        assert "recommended_methodology" in rendered_cards
        assert "**Traditional Approach (Waterfall / V-Model)**" in rendered_cards
        assert "**Agile Approach (Scrum / Kanban / XP)**" in rendered_cards
        assert "**Recommended Fit & Rationale**" in rendered_cards
        assert "**Tailored Practices, Ceremonies & Artifacts**" in rendered_cards
        assert "self-review" in rendered_cards

        # Step 2: SDLC Methodology & Operating Model Report prompt
        sdlc_report = prompt_list.get("sdlc-methodologies-report-2b5c8d1f")
        assert sdlc_report is not None
        assert (
            sdlc_report.metadata["title"]
            == "SDLC Methodology & Operating Model Report"
        )
        assert sdlc_report.metadata["type"] == "chat"
        assert sdlc_report.metadata["show"] is False

        # Verify follow-ups from SDLC Methodologies cards
        sdlc_follow_ups = [
            f["identifier"]
            for f in prompt_list.get_follow_ups("sdlc-methodologies-cards-1a4b7c9e")
        ]
        assert "sdlc-methodologies-report-2b5c8d1f" in sdlc_follow_ups
        assert "schedule-roadmap-report-7c2e4f9a" in sdlc_follow_ups
        assert "requirements-constraints-volere-spec-8f9e1d2c" in sdlc_follow_ups
        assert "adr-madr-spec-5a9b2d7f" in sdlc_follow_ups
        assert "cost-analysis-tco-report-6f9d4a2b" in sdlc_follow_ups
        assert "legal-contracts-report-9e4a6b2d" in sdlc_follow_ups


def test_nfr_architecture_characteristics_prompts_and_flows():
    import os
    import tempfile
    import shutil

    resources_prompts_chat = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "resources",
        "prompts_chat",
    )

    with tempfile.TemporaryDirectory() as tmp_pack:
        chat_dir = os.path.join(tmp_pack, "prompts", "chat")
        os.makedirs(chat_dir, exist_ok=True)
        for fname in os.listdir(resources_prompts_chat):
            shutil.copy(
                os.path.join(resources_prompts_chat, fname),
                os.path.join(chat_dir, fname),
            )

        knowledge_base = create_knowledge_base(TEST_KNOWLEDGE_PACK_PATH)
        knowledge_manager = create_knowledge_manager()
        prompt_list = PromptList(
            "chat", knowledge_base, knowledge_manager, root_dir=tmp_pack
        )

        # Step 1: Non-Functional Requirements / Architecture Characteristics cards prompt
        nfr_cards = prompt_list.get("nfr-architecture-characteristics-cards-3e7a9c2d")
        assert nfr_cards is not None
        assert (
            nfr_cards.metadata["title"]
            == "Non-Functional Requirements / Architecture Characteristics"
        )
        assert nfr_cards.metadata["categories"] == ["analysis", "architecture"]
        assert nfr_cards.metadata["type"] == "cards"
        assert nfr_cards.metadata["editable"] is True
        assert prompt_list.produces_json_output(
            "nfr-architecture-characteristics-cards-3e7a9c2d"
        )

        rendered_cards, template_cards = prompt_list.render_prompt(
            "nfr-architecture-characteristics-cards-3e7a9c2d",
            "1,500 RPS peak checkout load, p99 < 250ms, 99.95% uptime, RTO <= 15m, RPO = 0.",
            {"context": "European B2B Order Checkout Platform"},
        )
        assert "context" in template_cards.input_variables
        assert "user_input" in template_cards.input_variables
        assert "European B2B Order Checkout Platform" in rendered_cards
        assert (
            "1,500 RPS peak checkout load, p99 < 250ms, 99.95% uptime, RTO <= 15m, RPO = 0."
            in rendered_cards
        )
        assert "characteristic_category" in rendered_cards
        assert "priority_and_driving_status" in rendered_cards
        assert "**Quality Requirement & Scenario**" in rendered_cards
        assert "**Quantifiable Fit Criterion (SLI / SLO / Target Metric)**" in rendered_cards
        assert "**Architectural Impact & Trade-offs**" in rendered_cards
        assert "**Architectural Fitness Function & Verification**" in rendered_cards
        assert "self-review" in rendered_cards

        # Step 2: NFR & Architecture Characteristics Specification prompt
        nfr_spec = prompt_list.get("nfr-architecture-characteristics-spec-4f8b1d3e")
        assert nfr_spec is not None
        assert (
            nfr_spec.metadata["title"]
            == "NFR & Architecture Characteristics Specification"
        )
        assert nfr_spec.metadata["type"] == "chat"
        assert nfr_spec.metadata["show"] is False

        # Verify follow-ups from NFR / Architecture Characteristics cards
        nfr_follow_ups = [
            f["identifier"]
            for f in prompt_list.get_follow_ups(
                "nfr-architecture-characteristics-cards-3e7a9c2d"
            )
        ]
        assert "nfr-architecture-characteristics-spec-4f8b1d3e" in nfr_follow_ups
        assert "software-architecture-candidates-spec-9c3f1e5b" in nfr_follow_ups
        assert "adr-madr-spec-5a9b2d7f" in nfr_follow_ups
        assert "cost-analysis-tco-report-6f9d4a2b" in nfr_follow_ups
        assert "requirements-constraints-volere-spec-8f9e1d2c" in nfr_follow_ups
        assert "schedule-roadmap-report-7c2e4f9a" in nfr_follow_ups
        assert "legal-contracts-report-9e4a6b2d" in nfr_follow_ups
        assert "sdlc-methodologies-report-2b5c8d1f" in nfr_follow_ups


def test_software_architecture_candidates_prompts():
    """Verify that the Candidate Software Architectures cards and specification prompts
    load correctly, validate against required schema fields, render with context,
    and verify the prompt flow connections."""
    import os
    import tempfile
    import shutil

    resources_prompts_chat = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "resources",
        "prompts_chat",
    )

    with tempfile.TemporaryDirectory() as tmp_pack:
        chat_dir = os.path.join(tmp_pack, "prompts", "chat")
        os.makedirs(chat_dir, exist_ok=True)
        for fname in os.listdir(resources_prompts_chat):
            shutil.copy(
                os.path.join(resources_prompts_chat, fname),
                os.path.join(chat_dir, fname),
            )

        knowledge_base = create_knowledge_base(TEST_KNOWLEDGE_PACK_PATH)
        knowledge_manager = create_knowledge_manager()
        prompt_list = PromptList(
            "chat", knowledge_base, knowledge_manager, root_dir=tmp_pack
        )

        # Step 1: Candidate Software Architectures cards prompt
        arch_cards = prompt_list.get("software-architecture-candidates-cards-8d2e4f1a")
        assert arch_cards is not None
        assert arch_cards.metadata["title"] == "Candidate Software Architectures"
        assert arch_cards.metadata["categories"] == ["analysis", "architecture"]
        assert arch_cards.metadata["type"] == "cards"
        assert arch_cards.metadata["editable"] is True
        assert prompt_list.produces_json_output(
            "software-architecture-candidates-cards-8d2e4f1a"
        )

        rendered_cards, template_cards = prompt_list.render_prompt(
            "software-architecture-candidates-cards-8d2e4f1a",
            "Peak 1,500 RPS, p99 < 250ms, 99.95% uptime, modular monolith vs event-driven microservices.",
            {"context": "European B2B Order Platform"},
        )
        assert "context" in template_cards.input_variables
        assert "user_input" in template_cards.input_variables
        assert "European B2B Order Platform" in rendered_cards
        assert (
            "Peak 1,500 RPS, p99 < 250ms, 99.95% uptime, modular monolith vs event-driven microservices."
            in rendered_cards
        )
        assert "architecture_style" in rendered_cards
        assert "recommendation_status" in rendered_cards
        assert "**Architecture Overview & Topology**" in rendered_cards
        assert "**Alignment with Driving NFRs & '-ilities'**" in rendered_cards
        assert "**Trade-offs, Friction & Negative Consequences**" in rendered_cards
        assert "**Cost & Team Feasibility (Conway's Law & FinOps)**" in rendered_cards
        assert "**Key Fitness Function & Verification Gate**" in rendered_cards
        assert "self-review" in rendered_cards

        # Step 2: Candidate Software Architectures Specification prompt
        arch_spec = prompt_list.get("software-architecture-candidates-spec-9c3f1e5b")
        assert arch_spec is not None
        assert (
            arch_spec.metadata["title"]
            == "Candidate Software Architectures Specification"
        )
        assert arch_spec.metadata["type"] == "chat"
        assert arch_spec.metadata["show"] is False

        # Verify follow-ups from Candidate Software Architectures cards
        arch_follow_ups = [
            f["identifier"]
            for f in prompt_list.get_follow_ups(
                "software-architecture-candidates-cards-8d2e4f1a"
            )
        ]
        assert "software-architecture-candidates-spec-9c3f1e5b" in arch_follow_ups
        assert "adr-madr-spec-5a9b2d7f" in arch_follow_ups
        assert "nfr-architecture-characteristics-spec-4f8b1d3e" in arch_follow_ups
        assert "cost-analysis-tco-report-6f9d4a2b" in arch_follow_ups
        assert "requirements-constraints-volere-spec-8f9e1d2c" in arch_follow_ups
        assert "schedule-roadmap-report-7c2e4f9a" in arch_follow_ups
        assert "sdlc-methodologies-report-2b5c8d1f" in arch_follow_ups
        assert "legal-contracts-report-9e4a6b2d" in arch_follow_ups
        assert "togaf-gap-analysis-9d4a2b3e" in arch_follow_ups
        assert "project-objectives-spec-2e5b8d3a" in arch_follow_ups


def test_project_objectives_prompts_and_flows():
    """Verify that the Project Objectives cards and specification prompts
    load correctly, validate against required schema fields, render with context,
    and verify the prompt flow connections."""
    import os
    import tempfile
    import shutil

    resources_prompts_chat = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "resources",
        "prompts_chat",
    )

    with tempfile.TemporaryDirectory() as tmp_pack:
        chat_dir = os.path.join(tmp_pack, "prompts", "chat")
        os.makedirs(chat_dir, exist_ok=True)
        for fname in os.listdir(resources_prompts_chat):
            shutil.copy(
                os.path.join(resources_prompts_chat, fname),
                os.path.join(chat_dir, fname),
            )

        knowledge_base = create_knowledge_base(TEST_KNOWLEDGE_PACK_PATH)
        knowledge_manager = create_knowledge_manager()
        prompt_list = PromptList(
            "chat", knowledge_base, knowledge_manager, root_dir=tmp_pack
        )

        # Step 1: Project Objectives cards prompt
        objectives_cards = prompt_list.get("project-objectives-cards-1f4a7c2e")
        assert objectives_cards is not None
        assert objectives_cards.metadata["title"] == "Project Objectives"
        assert objectives_cards.metadata["categories"] == ["analysis"]
        assert objectives_cards.metadata["type"] == "cards"
        assert objectives_cards.metadata["editable"] is True
        assert prompt_list.produces_json_output("project-objectives-cards-1f4a7c2e")

        rendered_cards, template_cards = prompt_list.render_prompt(
            "project-objectives-cards-1f4a7c2e",
            "Reduce wholesale order processing turnaround from 4 days to <1 hour, cut error rate <0.5%.",
            {"context": "European B2B Wholesale Portal"},
        )
        assert "context" in template_cards.input_variables
        assert "user_input" in template_cards.input_variables
        assert "European B2B Wholesale Portal" in rendered_cards
        assert (
            "Reduce wholesale order processing turnaround from 4 days to <1 hour, cut error rate <0.5%."
            in rendered_cards
        )
        assert "objective_category" in rendered_cards
        assert "time_horizon" in rendered_cards
        assert "**Business Outcome & Value**" in rendered_cards
        assert "**SMART Breakdown**" in rendered_cards
        assert "**Quantifiable Fit Criterion**" in rendered_cards
        assert "**Primary Beneficiaries**" in rendered_cards
        assert "self-review" in rendered_cards

        # Step 2: Project Objectives & Value Specification prompt
        objectives_spec = prompt_list.get("project-objectives-spec-2e5b8d3a")
        assert objectives_spec is not None
        assert (
            objectives_spec.metadata["title"]
            == "Project Objectives & Value Specification"
        )
        assert objectives_spec.metadata["type"] == "chat"
        assert objectives_spec.metadata["show"] is False

        # Verify follow-ups from Project Objectives cards
        objectives_follow_ups = [
            f["identifier"]
            for f in prompt_list.get_follow_ups("project-objectives-cards-1f4a7c2e")
        ]
        assert "project-objectives-spec-2e5b8d3a" in objectives_follow_ups
        assert "requirements-constraints-volere-spec-8f9e1d2c" in objectives_follow_ups
        assert "nfr-architecture-characteristics-spec-4f8b1d3e" in objectives_follow_ups
        assert "cost-analysis-tco-report-6f9d4a2b" in objectives_follow_ups
        assert "software-architecture-candidates-spec-9c3f1e5b" in objectives_follow_ups
        assert "sdlc-methodologies-report-2b5c8d1f" in objectives_follow_ups
        assert "schedule-roadmap-report-7c2e4f9a" in objectives_follow_ups
        assert "legal-contracts-report-9e4a6b2d" in objectives_follow_ups
        assert "togaf-gap-analysis-9d4a2b3e" in objectives_follow_ups


def test_software_specification_prompts_and_flows():
    """Verify that the Software Specification & Workflows cards and detailed study
    prompts load correctly with category 'specification', validate against required schema fields,
    render with upstream analysis context, and verify prompt flow connections."""
    import os
    import tempfile
    import shutil

    resources_prompts_chat = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "resources",
        "prompts_chat",
    )

    with tempfile.TemporaryDirectory() as tmp_pack:
        chat_dir = os.path.join(tmp_pack, "prompts", "chat")
        os.makedirs(chat_dir, exist_ok=True)
        for fname in os.listdir(resources_prompts_chat):
            shutil.copy(
                os.path.join(resources_prompts_chat, fname),
                os.path.join(chat_dir, fname),
            )

        knowledge_base = create_knowledge_base(TEST_KNOWLEDGE_PACK_PATH)
        knowledge_manager = create_knowledge_manager()
        prompt_list = PromptList(
            "chat", knowledge_base, knowledge_manager, root_dir=tmp_pack
        )

        # Step 1: Software Specification & Workflows cards prompt
        spec_cards = prompt_list.get("software-specification-workflow-cards-9a4b2c1e")
        assert spec_cards is not None
        assert spec_cards.metadata["title"] == "Software Specification & Workflows"
        assert spec_cards.metadata["categories"] == ["specification"]
        assert spec_cards.metadata["type"] == "cards"
        assert spec_cards.metadata["editable"] is True
        assert prompt_list.produces_json_output("software-specification-workflow-cards-9a4b2c1e")

        rendered_cards, template_cards = prompt_list.render_prompt(
            "software-specification-workflow-cards-9a4b2c1e",
            "Synthesize B2B Wholesale checkout with offline sync (Volere), ADR-003 Outbox, and p99 < 300ms.",
            {"context": "European B2B Wholesale Commerce Platform Analysis Dossier"},
        )
        assert "context" in template_cards.input_variables
        assert "user_input" in template_cards.input_variables
        assert "European B2B Wholesale Commerce Platform Analysis Dossier" in rendered_cards
        assert "Synthesize B2B Wholesale checkout with offline sync" in rendered_cards
        assert "subsystem_domain" in rendered_cards
        assert "**Use Case Specifications**" in rendered_cards
        assert "**Workflow & Activity Orchestration**" in rendered_cards
        assert "**State Machine & Entity Lifecycle**" in rendered_cards
        assert "**Component Architecture & Interface Contracts**" in rendered_cards
        assert "**UML Diagram (Mermaid)**" in rendered_cards
        assert "**Traceability to Analysis Inputs**" in rendered_cards
        assert "self-review" in rendered_cards

        # Step 2: Software Solution Specification & Detailed Study report prompt
        spec_study = prompt_list.get("software-specification-detailed-study-7c3d1f5b")
        assert spec_study is not None
        assert (
            spec_study.metadata["title"]
            == "Software Solution Specification & Detailed Study"
        )
        assert spec_study.metadata["type"] == "chat"
        assert spec_study.metadata["categories"] == ["specification"]
        assert spec_study.metadata["show"] is False
        assert spec_study.metadata["editable"] is True

        # Verify follow-ups from Software Specification cards
        spec_follow_ups = [
            f["identifier"]
            for f in prompt_list.get_follow_ups("software-specification-workflow-cards-9a4b2c1e")
        ]
        assert "software-specification-detailed-study-7c3d1f5b" in spec_follow_ups
        assert "product-breakdown-structure-spec-4c8d2b0f" in spec_follow_ups
        assert "product-development-process-spec-6e0f4d2b" in spec_follow_ups
        assert "work-breakdown-structure-spec-8a2b6f4d" in spec_follow_ups
        assert "software-architecture-candidates-spec-9c3f1e5b" in spec_follow_ups
        assert "project-objectives-spec-2e5b8d3a" in spec_follow_ups
        assert "requirements-constraints-volere-spec-8f9e1d2c" in spec_follow_ups
        assert "adr-madr-spec-5a9b2d7f" in spec_follow_ups
        assert "nfr-architecture-characteristics-spec-4f8b1d3e" in spec_follow_ups
        assert "cost-analysis-tco-report-6f9d4a2b" in spec_follow_ups
        assert "sdlc-methodologies-report-2b5c8d1f" in spec_follow_ups
        assert "schedule-roadmap-report-7c2e4f9a" in spec_follow_ups
        assert "legal-contracts-report-9e4a6b2d" in spec_follow_ups
        assert "togaf-gap-analysis-9d4a2b3e" in spec_follow_ups

        # Verify upstream analysis prompts link to Software Specification Detailed Study
        req_breakdown_follow_ups = [
            f["identifier"]
            for f in prompt_list.get_follow_ups("requirements-breakdown-3a845a85")
        ]
        assert "software-specification-detailed-study-7c3d1f5b" in req_breakdown_follow_ups

        volere_follow_ups = [
            f["identifier"]
            for f in prompt_list.get_follow_ups("requirements-constraints-volere-4a1b2c3d")
        ]
        assert "software-specification-detailed-study-7c3d1f5b" in volere_follow_ups

        adr_follow_ups = [
            f["identifier"]
            for f in prompt_list.get_follow_ups("adr-cards-4f8a1c6e")
        ]
        assert "software-specification-detailed-study-7c3d1f5b" in adr_follow_ups

        legal_follow_ups = [
            f["identifier"]
            for f in prompt_list.get_follow_ups("legal-contracts-cards-8d3f5a1c")
        ]
        assert "software-specification-detailed-study-7c3d1f5b" in legal_follow_ups


def test_product_breakdown_structure_prompts_and_flows():
    """Verify that the Product Breakdown Structure (PBS) cards and specification
    prompts load correctly with category 'specification', validate against required schema fields,
    render with software specification context, and verify prompt flow connections."""
    import os
    import tempfile
    import shutil

    resources_prompts_chat = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "resources",
        "prompts_chat",
    )

    with tempfile.TemporaryDirectory() as tmp_pack:
        chat_dir = os.path.join(tmp_pack, "prompts", "chat")
        os.makedirs(chat_dir, exist_ok=True)
        for fname in os.listdir(resources_prompts_chat):
            shutil.copy(
                os.path.join(resources_prompts_chat, fname),
                os.path.join(chat_dir, fname),
            )

        knowledge_base = create_knowledge_base(TEST_KNOWLEDGE_PACK_PATH)
        knowledge_manager = create_knowledge_manager()
        prompt_list = PromptList(
            "chat", knowledge_base, knowledge_manager, root_dir=tmp_pack
        )

        # Step 1: PBS cards prompt
        pbs_cards = prompt_list.get("product-breakdown-structure-cards-3b7c1a9e")
        assert pbs_cards is not None
        assert pbs_cards.metadata["title"] == "Product Breakdown Structure (PBS)"
        assert pbs_cards.metadata["categories"] == ["specification"]
        assert pbs_cards.metadata["type"] == "cards"
        assert pbs_cards.metadata["editable"] is True
        assert prompt_list.produces_json_output("product-breakdown-structure-cards-3b7c1a9e")

        rendered_cards, template_cards = prompt_list.render_prompt(
            "product-breakdown-structure-cards-3b7c1a9e",
            "Decompose Subsystem 1 (Checkout Engine) and Subsystem 2 (Offline Sync Cache).",
            {"context": "European B2B Wholesale Portal Software Specification Dossier"},
        )
        assert "context" in template_cards.input_variables
        assert "user_input" in template_cards.input_variables
        assert "European B2B Wholesale Portal Software Specification Dossier" in rendered_cards
        assert "Decompose Subsystem 1 (Checkout Engine)" in rendered_cards
        assert "deliverable_category" in rendered_cards
        assert "parent_subsystem" in rendered_cards
        assert "**Deliverable Scope & Specification**" in rendered_cards
        assert "**Component Hierarchy & Child Deliverables**" in rendered_cards
        assert "**Acceptance & Fit Criteria (Quality Gates)**" in rendered_cards
        assert "**Packaging & Distribution Format**" in rendered_cards
        assert "self-review" in rendered_cards

        # Step 2: PBS Specification prompt
        pbs_spec = prompt_list.get("product-breakdown-structure-spec-4c8d2b0f")
        assert pbs_spec is not None
        assert (
            pbs_spec.metadata["title"]
            == "Product Breakdown Structure (PBS) Specification"
        )
        assert pbs_spec.metadata["type"] == "chat"
        assert pbs_spec.metadata["categories"] == ["specification"]
        assert pbs_spec.metadata["show"] is False
        assert pbs_spec.metadata["editable"] is True

        # Verify follow-ups from PBS cards
        pbs_follow_ups = [
            f["identifier"]
            for f in prompt_list.get_follow_ups("product-breakdown-structure-cards-3b7c1a9e")
        ]
        assert "product-breakdown-structure-spec-4c8d2b0f" in pbs_follow_ups
        assert "product-development-process-spec-6e0f4d2b" in pbs_follow_ups
        assert "work-breakdown-structure-spec-8a2b6f4d" in pbs_follow_ups
        assert "software-specification-detailed-study-7c3d1f5b" in pbs_follow_ups


def test_product_development_process_prompts_and_flows():
    """Verify that the Product Development Process (PDP) cards and specification
    prompts load correctly with category 'specification', validate against required schema fields,
    render with PBS context, and verify prompt flow connections."""
    import os
    import tempfile
    import shutil

    resources_prompts_chat = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "resources",
        "prompts_chat",
    )

    with tempfile.TemporaryDirectory() as tmp_pack:
        chat_dir = os.path.join(tmp_pack, "prompts", "chat")
        os.makedirs(chat_dir, exist_ok=True)
        for fname in os.listdir(resources_prompts_chat):
            shutil.copy(
                os.path.join(resources_prompts_chat, fname),
                os.path.join(chat_dir, fname),
            )

        knowledge_base = create_knowledge_base(TEST_KNOWLEDGE_PACK_PATH)
        knowledge_manager = create_knowledge_manager()
        prompt_list = PromptList(
            "chat", knowledge_base, knowledge_manager, root_dir=tmp_pack
        )

        # Step 1: PDP cards prompt
        pdp_cards = prompt_list.get("product-development-process-cards-5d9e3c1a")
        assert pdp_cards is not None
        assert pdp_cards.metadata["title"] == "Product Development Process (PDP)"
        assert pdp_cards.metadata["categories"] == ["specification"]
        assert pdp_cards.metadata["type"] == "cards"
        assert pdp_cards.metadata["editable"] is True
        assert prompt_list.produces_json_output("product-development-process-cards-5d9e3c1a")

        rendered_cards, template_cards = prompt_list.render_prompt(
            "product-development-process-cards-5d9e3c1a",
            "Define Stage 2 Architecture Spike and Stage 3 Core Service Build gates.",
            {"context": "European B2B Platform PBS and Architecture Baseline"},
        )
        assert "context" in template_cards.input_variables
        assert "user_input" in template_cards.input_variables
        assert "European B2B Platform PBS and Architecture Baseline" in rendered_cards
        assert "Define Stage 2 Architecture Spike" in rendered_cards
        assert "lifecycle_stage" in rendered_cards
        assert "gate_type" in rendered_cards
        assert "**Stage Purpose & Key Activities**" in rendered_cards
        assert "**Stage Gate Entry Criteria (Inputs)**" in rendered_cards
        assert "**Stage Gate Exit Criteria (Definition of Done)**" in rendered_cards
        assert "**Governance, RACI & Review Cadence**" in rendered_cards
        assert "self-review" in rendered_cards

        # Step 2: PDP Specification prompt
        pdp_spec = prompt_list.get("product-development-process-spec-6e0f4d2b")
        assert pdp_spec is not None
        assert (
            pdp_spec.metadata["title"]
            == "Product Development Process (PDP) Specification"
        )
        assert pdp_spec.metadata["type"] == "chat"
        assert pdp_spec.metadata["categories"] == ["specification"]
        assert pdp_spec.metadata["show"] is False
        assert pdp_spec.metadata["editable"] is True

        # Verify follow-ups from PDP cards
        pdp_follow_ups = [
            f["identifier"]
            for f in prompt_list.get_follow_ups("product-development-process-cards-5d9e3c1a")
        ]
        assert "product-development-process-spec-6e0f4d2b" in pdp_follow_ups
        assert "work-breakdown-structure-spec-8a2b6f4d" in pdp_follow_ups
        assert "product-breakdown-structure-spec-4c8d2b0f" in pdp_follow_ups


def test_work_breakdown_structure_prompts_and_flows():
    """Verify that the Detailed Work Breakdown Structure (WBS) cards and specification
    prompts load correctly with category 'specification', validate against required schema fields
    (including time, cost, and resources for each work item), and verify prompt flow connections."""
    import os
    import tempfile
    import shutil

    resources_prompts_chat = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "resources",
        "prompts_chat",
    )

    with tempfile.TemporaryDirectory() as tmp_pack:
        chat_dir = os.path.join(tmp_pack, "prompts", "chat")
        os.makedirs(chat_dir, exist_ok=True)
        for fname in os.listdir(resources_prompts_chat):
            shutil.copy(
                os.path.join(resources_prompts_chat, fname),
                os.path.join(chat_dir, fname),
            )

        knowledge_base = create_knowledge_base(TEST_KNOWLEDGE_PACK_PATH)
        knowledge_manager = create_knowledge_manager()
        prompt_list = PromptList(
            "chat", knowledge_base, knowledge_manager, root_dir=tmp_pack
        )

        # Step 1: Detailed WBS cards prompt
        wbs_cards = prompt_list.get("work-breakdown-structure-cards-7f1a5e3c")
        assert wbs_cards is not None
        assert wbs_cards.metadata["title"] == "Detailed Work Breakdown Structure (WBS)"
        assert wbs_cards.metadata["categories"] == ["specification"]
        assert wbs_cards.metadata["type"] == "cards"
        assert wbs_cards.metadata["editable"] is True
        assert prompt_list.produces_json_output("work-breakdown-structure-cards-7f1a5e3c")

        rendered_cards, template_cards = prompt_list.render_prompt(
            "work-breakdown-structure-cards-7f1a5e3c",
            "Generate work packages for Checkout Microservice and Offline SQLite Sync with €850/day rate.",
            {"context": "European B2B Wholesale Portal PBS Deliverables and PDP Stage Gates"},
        )
        assert "context" in template_cards.input_variables
        assert "user_input" in template_cards.input_variables
        assert "European B2B Wholesale Portal PBS Deliverables and PDP Stage Gates" in rendered_cards
        assert "Generate work packages for Checkout Microservice" in rendered_cards
        assert "wbs_level" in rendered_cards
        assert "pbs_deliverable_ref" in rendered_cards
        assert "pdp_stage_ref" in rendered_cards
        assert "**Scope of Work & Deliverable Outcome**" in rendered_cards
        assert "**Time & Effort Estimation (Three-Point PERT)**" in rendered_cards
        assert "**Cost Breakdown & Budget Impact**" in rendered_cards
        assert "**Resource Allocation & Staffing**" in rendered_cards
        assert "**Dependencies & Critical Path**" in rendered_cards
        assert "self-review" in rendered_cards

        # Step 2: Detailed WBS Specification prompt
        wbs_spec = prompt_list.get("work-breakdown-structure-spec-8a2b6f4d")
        assert wbs_spec is not None
        assert (
            wbs_spec.metadata["title"]
            == "Detailed Work Breakdown Structure (WBS) Specification"
        )
        assert wbs_spec.metadata["type"] == "chat"
        assert wbs_spec.metadata["categories"] == ["specification"]
        assert wbs_spec.metadata["show"] is False
        assert wbs_spec.metadata["editable"] is True

        # Verify follow-ups from WBS cards
        wbs_follow_ups = [
            f["identifier"]
            for f in prompt_list.get_follow_ups("work-breakdown-structure-cards-7f1a5e3c")
        ]
        assert "work-breakdown-structure-spec-8a2b6f4d" in wbs_follow_ups
        assert "quality-assurance-risk-matrix-spec-6c9f3b2e" in wbs_follow_ups
        assert "change-management-spec-8e1b5d4a" in wbs_follow_ups
        assert "cost-analysis-tco-report-6f9d4a2b" in wbs_follow_ups
        assert "schedule-roadmap-report-7c2e4f9a" in wbs_follow_ups
        assert "product-breakdown-structure-spec-4c8d2b0f" in wbs_follow_ups
        assert "product-development-process-spec-6e0f4d2b" in wbs_follow_ups
        assert "software-specification-detailed-study-7c3d1f5b" in wbs_follow_ups


def test_quality_assurance_risk_matrix_prompts_and_flows():
    """Verify that the Quality Assurance: Risk Matrix & Mitigation cards and specification
    prompts load correctly with category 'project-management', validate against required schema fields
    (including probability, impact, severity, prevention, and mitigation), and verify prompt flow connections."""
    import os
    import tempfile
    import shutil

    resources_prompts_chat = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "resources",
        "prompts_chat",
    )

    with tempfile.TemporaryDirectory() as tmp_pack:
        chat_dir = os.path.join(tmp_pack, "prompts", "chat")
        os.makedirs(chat_dir, exist_ok=True)
        for fname in os.listdir(resources_prompts_chat):
            shutil.copy(
                os.path.join(resources_prompts_chat, fname),
                os.path.join(chat_dir, fname),
            )

        knowledge_base = create_knowledge_base(TEST_KNOWLEDGE_PACK_PATH)
        knowledge_manager = create_knowledge_manager()
        prompt_list = PromptList(
            "chat", knowledge_base, knowledge_manager, root_dir=tmp_pack
        )

        # Step 1: QA Risk Matrix cards prompt
        qa_cards = prompt_list.get("quality-assurance-risk-matrix-cards-5b8e2a1d")
        assert qa_cards is not None
        assert qa_cards.metadata["title"] == "Quality Assurance: Risk Matrix & Mitigation"
        assert qa_cards.metadata["categories"] == ["project-management"]
        assert qa_cards.metadata["type"] == "cards"
        assert qa_cards.metadata["editable"] is True
        assert prompt_list.produces_json_output("quality-assurance-risk-matrix-cards-5b8e2a1d")

        rendered_cards, template_cards = prompt_list.render_prompt(
            "quality-assurance-risk-matrix-cards-5b8e2a1d",
            "Analyze offline sync data corruption and third-party SAP batch timeout risks.",
            {"context": "European B2B Wholesale Portal Delivery Architecture and WBS Scope"},
        )
        assert "context" in template_cards.input_variables
        assert "user_input" in template_cards.input_variables
        assert "European B2B Wholesale Portal Delivery Architecture and WBS Scope" in rendered_cards
        assert "Analyze offline sync data corruption" in rendered_cards
        assert "risk_category" in rendered_cards
        assert "probability" in rendered_cards
        assert "impact" in rendered_cards
        assert "severity" in rendered_cards
        assert "**Risk Description & Root Cause**" in rendered_cards
        assert "**Risk Treatment & Controls**" in rendered_cards
        assert "**Quality Assurance Verification Gate**" in rendered_cards
        assert "self-review" in rendered_cards

        # Step 2: QA Risk Management Plan Specification prompt
        qa_spec = prompt_list.get("quality-assurance-risk-matrix-spec-6c9f3b2e")
        assert qa_spec is not None
        assert (
            qa_spec.metadata["title"]
            == "Quality Assurance & Risk Management Plan"
        )
        assert qa_spec.metadata["type"] == "chat"
        assert qa_spec.metadata["categories"] == ["project-management"]
        assert qa_spec.metadata["show"] is False
        assert qa_spec.metadata["editable"] is True

        # Verify follow-ups from QA Risk Matrix cards
        qa_follow_ups = [
            f["identifier"]
            for f in prompt_list.get_follow_ups("quality-assurance-risk-matrix-cards-5b8e2a1d")
        ]
        assert "quality-assurance-risk-matrix-spec-6c9f3b2e" in qa_follow_ups
        assert "change-management-spec-8e1b5d4a" in qa_follow_ups
        assert "work-breakdown-structure-spec-8a2b6f4d" in qa_follow_ups
        assert "cost-analysis-tco-report-6f9d4a2b" in qa_follow_ups
        assert "schedule-roadmap-report-7c2e4f9a" in qa_follow_ups
        assert "software-specification-detailed-study-7c3d1f5b" in qa_follow_ups


def test_change_management_prompts_and_flows():
    """Verify that the Change Management cards and specification
    prompts load correctly with category 'project-management', validate against required schema fields
    (including stakeholder impact, communication, training, and rollback), and verify prompt flow connections."""
    import os
    import tempfile
    import shutil

    resources_prompts_chat = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "resources",
        "prompts_chat",
    )

    with tempfile.TemporaryDirectory() as tmp_pack:
        chat_dir = os.path.join(tmp_pack, "prompts", "chat")
        os.makedirs(chat_dir, exist_ok=True)
        for fname in os.listdir(resources_prompts_chat):
            shutil.copy(
                os.path.join(resources_prompts_chat, fname),
                os.path.join(chat_dir, fname),
            )

        knowledge_base = create_knowledge_base(TEST_KNOWLEDGE_PACK_PATH)
        knowledge_manager = create_knowledge_manager()
        prompt_list = PromptList(
            "chat", knowledge_base, knowledge_manager, root_dir=tmp_pack
        )

        # Step 1: Change Management cards prompt
        cm_cards = prompt_list.get("change-management-cards-7d0a4c3f")
        assert cm_cards is not None
        assert cm_cards.metadata["title"] == "Change Management"
        assert cm_cards.metadata["categories"] == ["project-management"]
        assert cm_cards.metadata["type"] == "cards"
        assert cm_cards.metadata["editable"] is True
        assert prompt_list.produces_json_output("change-management-cards-7d0a4c3f")

        rendered_cards, template_cards = prompt_list.render_prompt(
            "change-management-cards-7d0a4c3f",
            "Transition 45 sales reps and 300 wholesale distributors to self-service portal.",
            {"context": "European B2B Wholesale Self-Service Portal Rollout Plan"},
        )
        assert "context" in template_cards.input_variables
        assert "user_input" in template_cards.input_variables
        assert "European B2B Wholesale Self-Service Portal Rollout Plan" in rendered_cards
        assert "Transition 45 sales reps" in rendered_cards
        assert "change_dimension" in rendered_cards
        assert "target_stakeholders" in rendered_cards
        assert "**Change Scope & Business Imperative**" in rendered_cards
        assert "**Stakeholder Readiness & Resistance Analysis**" in rendered_cards
        assert "**Actionable Enablement Plan**" in rendered_cards
        assert "**Governance, Cutover & Rollback Protocols**" in rendered_cards
        assert "**Adoption KPIs & Verification**" in rendered_cards
        assert "self-review" in rendered_cards

        # Step 2: Change Management Specification prompt
        cm_spec = prompt_list.get("change-management-spec-8e1b5d4a")
        assert cm_spec is not None
        assert (
            cm_spec.metadata["title"]
            == "Change Management & Adoption Specification"
        )
        assert cm_spec.metadata["type"] == "chat"
        assert cm_spec.metadata["categories"] == ["project-management"]
        assert cm_spec.metadata["show"] is False
        assert cm_spec.metadata["editable"] is True

        # Verify follow-ups from Change Management cards
        cm_follow_ups = [
            f["identifier"]
            for f in prompt_list.get_follow_ups("change-management-cards-7d0a4c3f")
        ]
        assert "change-management-spec-8e1b5d4a" in cm_follow_ups
        assert "quality-assurance-risk-matrix-spec-6c9f3b2e" in cm_follow_ups
        assert "work-breakdown-structure-spec-8a2b6f4d" in cm_follow_ups
        assert "schedule-roadmap-report-7c2e4f9a" in cm_follow_ups
        assert "software-specification-detailed-study-7c3d1f5b" in cm_follow_ups








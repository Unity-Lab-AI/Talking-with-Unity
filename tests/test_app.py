import pytest
from playwright.sync_api import Page, expect

def test_text_generation(page: Page, base_url):
    page.goto(base_url)
    page.click("#launch-app")
    page.click("#mute-indicator")
    page.wait_for_selector('[data-role="user"].is-listening')
    
    # This is a placeholder for sending a voice command.
    # We are using the internal test hook to simulate a user input.
    page.evaluate("window.__unityTestHooks.sendUserInput('hello')")
    
    expect(page.locator('[data-role="ai"]')).to_have_class("is-speaking", timeout=10000)
    # We can't easily test the audio output, so we just check that the AI is "speaking".

def test_image_generation(page: Page, base_url):
    page.goto(base_url)
    page.click("#launch-app")
    page.click("#mute-indicator")
    page.wait_for_selector('[data-role="user"].is-listening')
    
    # This is a placeholder for sending a voice command.
    # We are using the internal test hook to simulate a user input.
    page.evaluate("window.__unityTestHooks.sendUserInput('show me a picture of a cat')")
    
    expect(page.locator("#hero-image")).to_have_attribute("src", timeout=15000)
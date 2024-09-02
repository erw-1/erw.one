// Function to fetch JSON and handle redirection
function handleRedirect() {
    // Get the hash part of the URL
    const hash = window.location.hash.substring(1); // Removes the '#' from the hash

    // Fetch the JSON file
    fetch('redirects.json')
        .then(response => {
            if (!response.ok) {
                throw new Error("Network response was not ok " + response.statusText);
            }
            return response.json();
        })
        .then(redirectMappings => {
            // Check if the hash matches any name in the JSON
            if (redirectMappings.hasOwnProperty(hash)) {
                const redirectTo = redirectMappings[hash];
                document.title = `Redirection sur ${hash}...`;

                // Perform the redirection
                window.location.href = redirectTo;
            } else {
                // If no match is found, you can handle it here (e.g., show an error message)
                document.body.innerHTML = "<p>Sorry, no redirection found for this link.</p>";
            }
        })
        .catch(error => {
            document.body.innerHTML = "<p>Sorry, something went wrong.</p>";
        });
}

// Execute the redirect function on page load
window.onload = handleRedirect;

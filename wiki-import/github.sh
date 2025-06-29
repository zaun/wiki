#!/bin/bash

since_id=0
output_file="all_public_repos.json"

echo "[" > "$output_file"
first_page=true

while : ; do
    echo "Fetching repositories since ID: $since_id"
    response=$(curl -s -i "https://api.github.com/repositories?since=$since_id")

    # Extract the JSON body
    json_body=$(echo "$response" | awk '/^$/{p=1;next}p')

    # Extract the Link header for pagination
    link_header=$(echo "$response" | grep '^Link:' | sed -e 's/^Link: //')

    # Check for empty response or errors
    if [ -z "$json_body" ] || [ "$json_body" == "[]" ]; then
        echo "No more repositories or error in response."
        break
    fi

    # Append to file
    if [ "$first_page" = true ]; then
        echo "$json_body" >> "$output_file"
        first_page=false
    else
        # Remove leading '[' and append to the file
        echo ",${json_body:1}" >> "$output_file"
    fi

    # Find the next 'since' ID
    next_link=$(echo "$link_header" | grep -o 'https://[^>]*rel="next"' | sed -e 's/rel="next"//' -e 's/.*<//' -e 's/>.*//')

    if [ -z "$next_link" ]; then
        echo "No 'next' link found. Reached end of repositories."
        break
    fi

    # Extract the 'since' parameter from the next link
    since_id=$(echo "$next_link" | grep -o 'since=[0-9]*' | cut -d'=' -f2)

    if [ -z "$since_id" ]; then
        echo "Could not extract since_id from next link. Exiting."
        break
    fi

    # Be a good citizen and respect rate limits
    sleep 1 # Adjust as needed, but don't hammer the API
done

echo "]" >> "$output_file"
echo "All public repositories (or as many as retrieved) saved to $output_file"
echo "You can now parse this JSON file, for example, using 'jq . $output_file'"
